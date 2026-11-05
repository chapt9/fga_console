package console

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"mime"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"slices"
	"strings"
	"time"
)

// StorageAudience is the audience of passes for fga's file API.
const StorageAudience = "fga-storage"

// passLifetime is how long a pass minted for one call to fga lives.
const passLifetime = 5 * time.Minute

// Server is the console server.
type Server struct {
	cfg      *Config
	minter   *Minter   // development sign-in only
	oidc     *provider // the organisation's login
	sessions *Sessions
	store    *Store
	storage  *url.URL
	admin    *url.URL
	admins   adminCache
	mes      meCache
	client   *http.Client
	web      fs.FS
	log      *slog.Logger
	now      func() time.Time
}

// New returns a console server. web holds the pages (index.html at its
// root).
//
// client reaches fga (with the console's certificate in production);
// sign-in with the organisation's login uses its own client, which trusts
// the system's certificate authorities.
func New(cfg *Config, web fs.FS, client *http.Client, log *slog.Logger, now func() time.Time) (*Server, error) {
	store, err := OpenStore(cfg.DataDir)
	if err != nil {
		return nil, err
	}
	u, err := url.Parse(cfg.StorageURL)
	if err != nil {
		return nil, err
	}
	s := &Server{cfg: cfg, sessions: NewSessions(time.Duration(cfg.SessionHours)*time.Hour, 30*time.Minute, now), store: store,
		storage: u, admins: adminCache{seen: map[string]time.Time{}}, mes: meCache{seen: map[string]meEntry{}}, client: client, web: web, log: log, now: now}
	if d := cfg.DevSignIn; d != nil {
		key, err := ReadIssuerKey(d.KeyFile)
		if err != nil {
			return nil, err
		}
		s.minter = NewMinter(d.Issuer, d.KeyID, cfg.Tenant, key, now)
	}
	if cfg.OIDC != nil {
		if s.oidc, err = newProvider(cfg.OIDC, cfg.PublicURL, &http.Client{Timeout: 15 * time.Second}, now); err != nil {
			return nil, err
		}
	}
	if cfg.AdminURL != "" {
		if s.admin, err = url.Parse(cfg.AdminURL); err != nil {
			return nil, err
		}
	}
	return s, nil
}

// Handler returns the console's routes: the pages, and the API the pages
// call under /api.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	static := http.FileServerFS(s.web)
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		// Pages are checked with the server on every load, so a new
		// console version shows at once.
		w.Header().Set("Cache-Control", "no-cache")
		static.ServeHTTP(w, r)
	})
	mux.HandleFunc("GET /api/session", s.session)
	mux.HandleFunc("POST /api/signout", s.signOut)
	if s.minter != nil {
		mux.HandleFunc("POST /api/signin", s.signIn)
	}
	if s.cfg.KeySignIn {
		mux.HandleFunc("POST /api/signin/keys", s.signInKeys)
		mux.HandleFunc("POST /api/session/passes", s.authed(s.renewKeyPasses))
	}
	if s.oidc != nil {
		mux.HandleFunc("GET /auth/login", s.login)
		mux.HandleFunc("GET /auth/callback", s.callback)
		mux.HandleFunc("GET /invite/{secret}", s.invite)
	}
	mux.HandleFunc("GET /api/spaces", s.user(s.spaces))
	mux.HandleFunc("GET /api/files", s.user(s.listFiles))
	mux.HandleFunc("PUT /api/files", s.user(s.uploadFile))
	mux.HandleFunc("DELETE /api/files", s.user(s.deleteFile))
	mux.HandleFunc("GET /api/files/content", s.user(s.download))
	mux.HandleFunc("GET /api/files/info", s.user(s.fileInfo))
	mux.HandleFunc("PUT /api/files/label", s.user(s.setLabel))
	mux.HandleFunc("GET /api/shares", s.user(s.listShares))
	mux.HandleFunc("POST /api/shares", s.user(s.giveAccess))
	mux.HandleFunc("DELETE /api/shares", s.user(s.removeShare))
	mux.HandleFunc("GET /api/batches", s.user(s.batches))
	mux.HandleFunc("POST /api/batches/{id}/take-back", s.user(s.takeBack))
	mux.HandleFunc("GET /api/approvals", s.user(s.approvals))
	mux.HandleFunc("POST /api/approvals/{id}", s.user(s.decideApproval))
	mux.HandleFunc("POST /api/data-tools/preview", s.user(s.previewTool))
	s.adminRoutes(mux)
	return s.logged(s.secureHeaders(mux))
}

// ---------------------------------------------------------------- plumbing

// secure reports whether the console serves HTTPS, which makes its cookies
// HTTPS-only.
func (s *Server) secure() bool { return s.cfg.TLS != nil }

func (s *Server) secureHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		if s.secure() {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		h.Set("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; "+
			"connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Frame-Options", "DENY")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			h.Set("Cache-Control", "no-store")
		}
		next.ServeHTTP(w, r)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) { w.status = code; w.ResponseWriter.WriteHeader(code) }
func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// logged logs each API request by its route, never its query: queries hold
// file names, which stay out of logs.
func (s *Server) logged(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := s.now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		if strings.HasPrefix(r.URL.Path, "/api/") {
			s.log.Info("request", "route", r.Pattern, "status", sw.status, "ms", s.now().Sub(start).Milliseconds())
		}
	})
}

// apiError answers with fga's error shape: {"error": CODE}.
func apiError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
		return false
	}
	return true
}

type handler func(w http.ResponseWriter, r *http.Request, person string)

// authed admits requests of a signed-in person. A request that changes
// something must also carry the X-Fga-Console header, which other sites
// cannot send, and come from this console's own origin when it names one.
func (s *Server) authed(fn handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ss, ok := s.sessionOf(r)
		if !ok {
			apiError(w, http.StatusUnauthorized, "UNAUTHENTICATED")
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			if r.Header.Get("X-Fga-Console") != "1" || !sameOrigin(r) {
				apiError(w, http.StatusForbidden, "CROSS_SITE")
				return
			}
		}
		fn(w, r.WithContext(context.WithValue(r.Context(), sessionKey{}, ss)), ss.Person)
	}
}

type sessionKey struct{}

// sessionOf returns the live session the request's cookie names.
func (s *Server) sessionOf(r *http.Request) (*Session, bool) {
	c, err := r.Cookie(cookieName(s.secure()))
	if err != nil {
		return nil, false
	}
	return s.sessions.Get(c.Value)
}

// pass returns the pass a call to fga carries: the person's access token
// from the organisation's login, or in development a pass minted for them.
func (s *Server) pass(ctx context.Context, person, audience string) (string, error) {
	// A person who signed in with a key uses the passes their add-on gave,
	// never a pass this console makes (keysignin.go).
	if ss, _ := ctx.Value(sessionKey{}).(*Session); ss != nil && ss.keySession() {
		if ss.Person != person {
			return "", errSignedOut
		}
		if p, ok := ss.keyPass(audience, s.now().Add(keyPassMargin)); ok {
			return p, nil
		}
		return "", errSignedOut
	}
	if s.oidc != nil {
		ss, _ := ctx.Value(sessionKey{}).(*Session)
		if ss == nil || ss.Person != person {
			return "", errSignedOut
		}
		return s.accessToken(ctx, ss)
	}
	if s.minter == nil {
		return "", errSignedOut
	}
	return s.minter.Pass(person, audience, passLifetime)
}

func sameOrigin(r *http.Request) bool {
	o := r.Header.Get("Origin")
	if o == "" {
		return true
	}
	u, err := url.Parse(o)
	return err == nil && u.Host == r.Host
}

// call sends one request to fga's file API with a fresh pass for person.
func (s *Server) call(r *http.Request, person, method, p string, q url.Values, body io.Reader, size int64, hdr http.Header) (*http.Response, error) {
	pass, err := s.pass(r.Context(), person, StorageAudience)
	if err != nil {
		return nil, err
	}
	u := *s.storage
	u.Path = strings.TrimRight(u.Path, "/") + p
	u.RawPath = ""
	u.RawQuery = q.Encode()
	req, err := http.NewRequestWithContext(r.Context(), method, u.String(), body)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.ContentLength = size
	}
	for k, v := range hdr {
		req.Header[k] = v
	}
	req.Header.Set("Authorization", "Bearer "+pass)
	return s.client.Do(req)
}

// relay passes fga's answer on: JSON as it is, anything else as an error.
func relay(w http.ResponseWriter, resp *http.Response) {
	defer resp.Body.Close()
	ct, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if ct != "application/json" {
		if resp.StatusCode < 300 {
			w.WriteHeader(resp.StatusCode)
			return
		}
		apiError(w, resp.StatusCode, "UNAVAILABLE")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, io.LimitReader(resp.Body, 16<<20))
}

// fgaDown answers when fga cannot be reached, or when the person's sign-in
// ended and can give no pass.
func (s *Server) fgaDown(w http.ResponseWriter, err error) {
	if errors.Is(err, errSignedOut) {
		apiError(w, http.StatusUnauthorized, "UNAUTHENTICATED")
		return
	}
	s.log.Warn("fga unreachable", "err", err)
	apiError(w, http.StatusBadGateway, "UNAVAILABLE")
}

func bucketPath(space, rest string) string { return "/v1/buckets/" + url.PathEscape(space) + rest }

// spaceKey reads and checks a request's space and key.
func spaceKey(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	q := r.URL.Query()
	space, key := q.Get("space"), q.Get("key")
	if !spaceName.MatchString(space) || !validKey(key) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
		return "", "", false
	}
	return space, key, true
}

func validKey(k string) bool {
	return k != "" && len(k) <= 1024 && !strings.ContainsAny(k, "\x00\r\n")
}

// ---------------------------------------------------------------- sign-in

func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	out := map[string]any{"signed_in": false, "organisation": s.cfg.Organisation, "tenant": s.cfg.Tenant, "dev": s.minter != nil,
		"key_sign_in": s.cfg.KeySignIn}
	if s.minter != nil {
		out["people"] = s.cfg.DevSignIn.People
	} else if s.oidc != nil {
		out["login"] = "/auth/login"
	}
	if ss, ok := s.sessionOf(r); ok {
		ctx := context.WithValue(r.Context(), sessionKey{}, ss)
		out["signed_in"], out["person"], out["name"] = true, ss.Person, firstOf(ss.Name, ss.Person)
		if ss.keySession() {
			out["with_key"], out["passes_until"] = true, ss.keyPassesUntil()
		}
		out["admin"] = s.isAdmin(ctx, ss.Person)
		rights, ok, err := s.me(ctx, ss.Person)
		out["access"], out["rights"] = ok, rights
		out["invited"] = !ok && s.store.Waiting(ss.Person)
		if err != nil {
			out["access_error"] = "UNAVAILABLE"
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) signIn(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Fga-Console") != "1" || !sameOrigin(r) {
		apiError(w, http.StatusForbidden, "CROSS_SITE")
		return
	}
	var body struct {
		Person string `json:"person"`
	}
	if !decode(w, r, &body) {
		return
	}
	if !slices.Contains(s.cfg.DevSignIn.People, body.Person) {
		apiError(w, http.StatusForbidden, "UNKNOWN_PERSON")
		return
	}
	ss, err := s.sessions.Start(body.Person)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "INTERNAL")
		return
	}
	http.SetCookie(w, cookie(ss.ID, s.cfg.SessionHours*3600, s.secure()))
	s.log.Info("signed in", "person", body.Person)
	s.forgetMe(body.Person)
	writeJSON(w, http.StatusOK, map[string]string{"person": ss.Person})
}

// signOut ends the session, and answers where the browser goes next: the
// organisation login's own sign-out, when it has one.
func (s *Server) signOut(w http.ResponseWriter, r *http.Request) {
	ss, _ := s.sessionOf(r)
	next := s.logoutURL(r.Context(), ss)
	if ss != nil {
		s.sessions.End(ss.ID)
	}
	http.SetCookie(w, cookie("", -1, s.secure()))
	writeJSON(w, http.StatusOK, map[string]string{"logout_url": next})
}

// ---------------------------------------------------------------- files

// spaces answers which of the configured spaces fga lets the person list,
// with each space's encryption mode where fga tells it.
func (s *Server) spaces(w http.ResponseWriter, r *http.Request, person string) {
	type space struct {
		Name       string `json:"name"`
		Encryption string `json:"encryption,omitempty"`
	}
	out := []space{}
	for _, name := range s.cfg.Spaces {
		resp, err := s.call(r, person, http.MethodGet, bucketPath(name, "/objects"), url.Values{"limit": {"1"}}, nil, 0, nil)
		if err != nil {
			s.fgaDown(w, err)
			return
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			continue
		}
		sp := space{Name: name}
		if resp, err := s.call(r, person, http.MethodGet, bucketPath(name, "/encryption"), nil, nil, 0, nil); err == nil {
			var e struct {
				Encryption string `json:"encryption"`
			}
			if resp.StatusCode == http.StatusOK {
				_ = json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&e)
			}
			resp.Body.Close()
			sp.Encryption = e.Encryption
		}
		out = append(out, sp)
	}
	writeJSON(w, http.StatusOK, map[string]any{"spaces": out})
}

func (s *Server) listFiles(w http.ResponseWriter, r *http.Request, person string) {
	q := r.URL.Query()
	space := q.Get("space")
	if !spaceName.MatchString(space) || len(q.Get("prefix")) > 1024 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
		return
	}
	fq := url.Values{"limit": {"500"}}
	if p := q.Get("prefix"); p != "" {
		fq.Set("prefix", p)
	}
	if c := q.Get("continuation"); c != "" {
		fq.Set("continuation", c)
	}
	resp, err := s.call(r, person, http.MethodGet, bucketPath(space, "/objects"), fq, nil, 0, nil)
	if err != nil {
		s.fgaDown(w, err)
		return
	}
	relay(w, resp)
}

func (s *Server) uploadFile(w http.ResponseWriter, r *http.Request, person string) {
	space, key, ok := spaceKey(w, r)
	if !ok {
		return
	}
	limit := s.cfg.MaxUploadMB << 20
	if r.ContentLength < 0 {
		apiError(w, http.StatusLengthRequired, "INVALID_REQUEST")
		return
	}
	if r.ContentLength > limit {
		apiError(w, http.StatusRequestEntityTooLarge, "TOO_LARGE")
		return
	}
	hdr := http.Header{"Content-Type": {"application/octet-stream"}}
	if l := r.Header.Get("X-Fga-Label"); l != "" {
		hdr.Set("Fga-Label", l)
	}
	if r.URL.Query().Get("replace") != "1" {
		hdr.Set("If-None-Match", "*")
	}
	resp, err := s.call(r, person, http.MethodPut, bucketPath(space, "/object"), url.Values{"key": {key}},
		http.MaxBytesReader(w, r.Body, r.ContentLength), r.ContentLength, hdr)
	if err != nil {
		s.fgaDown(w, err)
		return
	}
	relay(w, resp)
}

func (s *Server) deleteFile(w http.ResponseWriter, r *http.Request, person string) {
	space, key, ok := spaceKey(w, r)
	if !ok {
		return
	}
	resp, err := s.call(r, person, http.MethodDelete, bucketPath(space, "/object"), url.Values{"key": {key}}, nil, 0, nil)
	if err != nil {
		s.fgaDown(w, err)
		return
	}
	relay(w, resp)
}

func (s *Server) fileInfo(w http.ResponseWriter, r *http.Request, person string) {
	space, key, ok := spaceKey(w, r)
	if !ok {
		return
	}
	resp, err := s.call(r, person, http.MethodGet, bucketPath(space, "/object"), url.Values{"key": {key}}, nil, 0, nil)
	if err != nil {
		s.fgaDown(w, err)
		return
	}
	relay(w, resp)
}

// download streams a file from fga to the browser, always as a download:
// a file is never shown as a page of this console, whatever it contains.
func (s *Server) download(w http.ResponseWriter, r *http.Request, person string) {
	space, key, ok := spaceKey(w, r)
	if !ok {
		return
	}
	resp, err := s.call(r, person, http.MethodGet, bucketPath(space, "/object/content"), url.Values{"key": {key}}, nil, 0, nil)
	if err != nil {
		s.fgaDown(w, err)
		return
	}
	if resp.StatusCode != http.StatusOK {
		relay(w, resp)
		return
	}
	defer resp.Body.Close()
	h := w.Header()
	h.Set("Content-Type", "application/octet-stream")
	h.Set("Content-Disposition", attachment(path.Base(key)))
	if n := resp.Header.Get("Content-Length"); n != "" {
		h.Set("Content-Length", n)
	}
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, resp.Body); err != nil {
		panic(http.ErrAbortHandler)
	}
}

var unsafeName = regexp.MustCompile(`[^A-Za-z0-9._-]`)

func attachment(name string) string {
	plain := unsafeName.ReplaceAllString(name, "_")
	if plain == "" || plain == "." || plain == ".." {
		plain = "file"
	}
	return fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, plain, url.PathEscape(name))
}

func (s *Server) setLabel(w http.ResponseWriter, r *http.Request, person string) {
	space, key, ok := spaceKey(w, r)
	if !ok {
		return
	}
	var body struct {
		Label string `json:"label"`
	}
	if !decode(w, r, &body) {
		return
	}
	raw, _ := json.Marshal(body)
	resp, err := s.call(r, person, http.MethodPut, bucketPath(space, "/object/label"), url.Values{"key": {key}},
		strings.NewReader(string(raw)), int64(len(raw)), http.Header{"Content-Type": {"application/json"}})
	if err != nil {
		s.fgaDown(w, err)
		return
	}
	relay(w, resp)
}

// ---------------------------------------------------------------- shares

func (s *Server) listShares(w http.ResponseWriter, r *http.Request, person string) {
	space, key, ok := spaceKey(w, r)
	if !ok {
		return
	}
	resp, err := s.call(r, person, http.MethodGet, bucketPath(space, "/grants"), url.Values{"key": {key}}, nil, 0, nil)
	if err != nil {
		s.fgaDown(w, err)
		return
	}
	relay(w, resp)
}

// shareActions are what a share of a single file may name: an object's
// read set (fga SHR-001).
var shareActions = []string{"read", "stat", "discover"}

// giveAccess records one share per file with fga, each decided on its own,
// and keeps the files fga accepted as one batch to take back together.
func (s *Server) giveAccess(w http.ResponseWriter, r *http.Request, person string) {
	var body struct {
		Grantee string      `json:"grantee"`
		Actions []string    `json:"actions"`
		Days    int         `json:"days"`
		Files   []BatchFile `json:"files"`
	}
	if !decode(w, r, &body) {
		return
	}
	if !personID.MatchString(body.Grantee) || body.Grantee == person || len(body.Actions) == 0 || body.Days < 1 || body.Days > 90 ||
		len(body.Files) == 0 || len(body.Files) > 500 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
		return
	}
	for _, a := range body.Actions {
		if !slices.Contains(shareActions, a) {
			apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
			return
		}
	}
	for _, f := range body.Files {
		if !spaceName.MatchString(f.Space) || !validKey(f.Key) {
			apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
			return
		}
	}
	expires := s.now().Add(time.Duration(body.Days) * 24 * time.Hour).UTC().Truncate(time.Second)
	grant, _ := json.Marshal(map[string]any{"grantee": body.Grantee, "actions": body.Actions, "expires_at": expires})
	type result struct {
		Space  string `json:"space"`
		Key    string `json:"key"`
		Status int    `json:"status"`
		Error  string `json:"error,omitempty"`
	}
	results := make([]result, 0, len(body.Files))
	var shared []BatchFile
	for _, f := range body.Files {
		resp, err := s.call(r, person, http.MethodPost, bucketPath(f.Space, "/grants"), url.Values{"key": {f.Key}},
			strings.NewReader(string(grant)), int64(len(grant)), http.Header{"Content-Type": {"application/json"}})
		if err != nil {
			s.fgaDown(w, err)
			return
		}
		res := result{Space: f.Space, Key: f.Key, Status: resp.StatusCode}
		var e struct {
			Error  string `json:"error"`
			Status string `json:"status"`
		}
		_ = json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(&e)
		resp.Body.Close()
		switch {
		case resp.StatusCode == http.StatusOK:
			shared = append(shared, f)
		case resp.StatusCode == http.StatusAccepted:
			res.Error = e.Status
		default:
			res.Error = e.Error
		}
		results = append(results, res)
	}
	out := map[string]any{"results": results, "expires": expires}
	if len(shared) > 0 {
		b := Batch{ID: newID(), Grantor: person, Grantee: body.Grantee, Actions: body.Actions, Created: s.now().UTC(), Expires: expires, Files: shared}
		if err := s.store.AddBatch(b); err != nil {
			s.log.Error("recording a batch", "err", err)
		} else {
			out["batch"] = b.ID
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) removeShare(w http.ResponseWriter, r *http.Request, person string) {
	space, key, ok := spaceKey(w, r)
	if !ok {
		return
	}
	grantee := r.URL.Query().Get("grantee")
	if !personID.MatchString(grantee) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
		return
	}
	resp, err := s.call(r, person, http.MethodDelete, bucketPath(space, "/grants"), url.Values{"key": {key}, "grantee": {grantee}}, nil, 0, nil)
	if err != nil {
		s.fgaDown(w, err)
		return
	}
	relay(w, resp)
}

func (s *Server) batches(w http.ResponseWriter, r *http.Request, person string) {
	writeJSON(w, http.StatusOK, map[string]any{"batches": s.store.BatchesOf(person, s.now())})
}

// takeBack removes every share of a batch that is still there. A share
// already gone (fga answers not found) counts as taken back.
func (s *Server) takeBack(w http.ResponseWriter, r *http.Request, person string) {
	b, ok := s.store.Batch(r.PathValue("id"), person)
	if !ok {
		apiError(w, http.StatusNotFound, "NOT_FOUND")
		return
	}
	var left []BatchFile
	type failure struct {
		Space string `json:"space"`
		Key   string `json:"key"`
		Error string `json:"error"`
	}
	var failed []failure
	for _, f := range b.Files {
		resp, err := s.call(r, person, http.MethodDelete, bucketPath(f.Space, "/grants"), url.Values{"key": {f.Key}, "grantee": {b.Grantee}}, nil, 0, nil)
		if err != nil {
			s.fgaDown(w, err)
			return
		}
		var e struct {
			Error string `json:"error"`
		}
		_ = json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(&e)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
			left = append(left, f)
			failed = append(failed, failure{Space: f.Space, Key: f.Key, Error: e.Error})
		}
	}
	if err := s.store.KeepFiles(b.ID, person, left, s.now()); err != nil {
		s.log.Error("updating a batch", "err", err)
	}
	writeJSON(w, http.StatusOK, map[string]any{"taken_back": len(b.Files) - len(left), "failed": failed})
}

func newID() string {
	raw := make([]byte, 12)
	_, _ = rand.Read(raw)
	return hex.EncodeToString(raw)
}

// ---------------------------------------------------------------- approvals

func (s *Server) approvals(w http.ResponseWriter, r *http.Request, person string) {
	resp, err := s.call(r, person, http.MethodGet, "/v1/approvals", url.Values{"limit": {"100"}}, nil, 0, nil)
	if err != nil {
		s.fgaDown(w, err)
		return
	}
	relay(w, resp)
}

var approvalID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

func (s *Server) decideApproval(w http.ResponseWriter, r *http.Request, person string) {
	id := r.PathValue("id")
	var body struct {
		Decision string `json:"decision"`
	}
	if !decode(w, r, &body) {
		return
	}
	if !approvalID.MatchString(id) || (body.Decision != "approve" && body.Decision != "reject") {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
		return
	}
	raw, _ := json.Marshal(body)
	resp, err := s.call(r, person, http.MethodPost, "/v1/approvals/"+url.PathEscape(id), nil,
		strings.NewReader(string(raw)), int64(len(raw)), http.Header{"Content-Type": {"application/json"}})
	if err != nil {
		s.fgaDown(w, err)
		return
	}
	relay(w, resp)
}
