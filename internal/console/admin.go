package console

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sync"
	"time"
)

// The administrator's routes. Each forwards to fga's admin API with the
// signed-in person's own admin pass, so fga's admin.json decides who is an
// administrator (ADM-002), never the console. The console's own records
// (profiles, the rule draft, server health) are served only to people the
// admin API accepts.

var delegationID = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,128}$`)

// IDs of fga's data sources and data tools (docs/design/mcp-data-tools.md
// in fga).
var (
	sourceID = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,39}$`)
	toolName = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)
)

// adminCache remembers for a minute who the admin API accepted, so a page
// load does not ask on every call.
type adminCache struct {
	mu   sync.Mutex
	seen map[string]time.Time
}

func (s *Server) adminRoutes(mux *http.ServeMux) {
	if s.admin == nil {
		return
	}
	idOf := map[string]*regexp.Regexp{"/v1/admin/delegations/": delegationID, "/v1/admin/sources/": sourceID, "/v1/admin/data-tools/": toolName}
	id := func(prefix, suffix string) func(*http.Request) (string, bool) {
		return func(r *http.Request) (string, bool) {
			v := r.PathValue("id")
			re, ok := idOf[prefix]
			if !ok {
				re = personID
			}
			return prefix + url.PathEscape(v) + suffix, re.MatchString(v)
		}
	}
	fixed := func(p string) func(*http.Request) (string, bool) {
		return func(*http.Request) (string, bool) { return p, true }
	}
	mux.HandleFunc("GET /api/admin/people", s.authed(s.forward(fixed("/v1/admin/identities"), "after", "limit")))
	mux.HandleFunc("PUT /api/admin/people/{id}", s.authed(s.forward(id("/v1/admin/identities/", ""))))
	mux.HandleFunc("POST /api/admin/people/{id}/disable", s.authed(s.forward(id("/v1/admin/identities/", "/disable"))))
	mux.HandleFunc("POST /api/admin/people/{id}/grant", s.authed(s.forward(id("/v1/admin/identities/", "/capabilities/grant"))))
	mux.HandleFunc("POST /api/admin/people/{id}/revoke", s.authed(s.forward(id("/v1/admin/identities/", "/capabilities/revoke"))))
	mux.HandleFunc("GET /api/admin/delegations", s.authed(s.forward(fixed("/v1/admin/delegations"), "after", "limit")))
	mux.HandleFunc("POST /api/admin/delegations", s.authed(s.forward(fixed("/v1/admin/delegations"))))
	mux.HandleFunc("POST /api/admin/delegations/{id}/revoke", s.authed(s.forward(id("/v1/admin/delegations/", "/revoke"))))
	mux.HandleFunc("GET /api/admin/spaces", s.authed(s.forward(fixed("/v1/admin/buckets"), "after", "limit")))
	mux.HandleFunc("POST /api/admin/spaces", s.authed(s.forward(fixed("/v1/admin/buckets"))))
	mux.HandleFunc("GET /api/admin/rules", s.authed(s.forward(fixed("/v1/admin/policy"))))
	mux.HandleFunc("GET /api/admin/events", s.authed(s.forward(fixed("/v1/admin/events"), "limit")))
	mux.HandleFunc("GET /api/admin/sources", s.authed(s.forward(fixed("/v1/admin/sources"), "after", "limit")))
	mux.HandleFunc("POST /api/admin/sources", s.authed(s.forward(fixed("/v1/admin/sources"))))
	mux.HandleFunc("PUT /api/admin/sources/{id}", s.authed(s.forward(id("/v1/admin/sources/", ""))))
	for _, step := range []string{"try", "review", "disable"} {
		mux.HandleFunc("POST /api/admin/sources/{id}/"+step, s.authed(s.forward(id("/v1/admin/sources/", "/"+step))))
	}
	mux.HandleFunc("GET /api/admin/data-tools", s.authed(s.forward(fixed("/v1/admin/data-tools"), "source", "after", "limit")))
	mux.HandleFunc("POST /api/admin/data-tools", s.authed(s.forward(fixed("/v1/admin/data-tools"))))
	mux.HandleFunc("PUT /api/admin/data-tools/{id}", s.authed(s.forward(id("/v1/admin/data-tools/", ""))))
	for _, step := range []string{"review", "disable"} {
		mux.HandleFunc("POST /api/admin/data-tools/{id}/"+step, s.authed(s.forward(id("/v1/admin/data-tools/", "/"+step))))
	}

	mux.HandleFunc("GET /api/admin/rights", s.authed(s.adminOnly(func(w http.ResponseWriter, r *http.Request, _ string) {
		writeJSON(w, http.StatusOK, map[string]any{"rights": Rights, "profiles": s.store.Profiles()})
	})))
	mux.HandleFunc("PUT /api/admin/profiles", s.authed(s.adminOnly(s.putProfiles)))
	mux.HandleFunc("GET /api/admin/rules/draft", s.authed(s.adminOnly(func(w http.ResponseWriter, r *http.Request, _ string) {
		d := s.store.Draft()
		if d == nil {
			d = json.RawMessage("null")
		}
		writeJSON(w, http.StatusOK, map[string]json.RawMessage{"draft": d})
	})))
	mux.HandleFunc("PUT /api/admin/rules/draft", s.authed(s.adminOnly(s.putDraft)))
	mux.HandleFunc("DELETE /api/admin/rules/draft", s.authed(s.adminOnly(func(w http.ResponseWriter, r *http.Request, _ string) {
		if err := s.store.SetDraft(nil); err != nil {
			apiError(w, http.StatusInternalServerError, "INTERNAL")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})))
	mux.HandleFunc("GET /api/admin/servers", s.authed(s.adminOnly(s.servers)))
	s.invitationRoutes(mux)
}

// callAdmin sends one request to fga's admin API with a fresh admin pass
// for person. In development the admin API names this console by its
// configured development console ID; in production by its certificate.
func (s *Server) callAdmin(ctx context.Context, person, method, p string, q url.Values, body io.Reader, size int64) (*http.Response, error) {
	pass, err := s.pass(ctx, person, s.cfg.AdminAudience)
	if err != nil {
		return nil, err
	}
	u := *s.admin
	u.Path = p
	u.RawPath = ""
	u.RawQuery = q.Encode()
	req, err := http.NewRequestWithContext(ctx, method, u.String(), body)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.ContentLength = size
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Authorization", "Bearer "+pass)
	return s.client.Do(req)
}

// forward relays one admin action: the body (JSON, at most 64 KiB) and the
// named query parameters go to fga's admin API at the mapped path.
func (s *Server) forward(target func(*http.Request) (string, bool), query ...string) handler {
	return func(w http.ResponseWriter, r *http.Request, person string) {
		p, ok := target(r)
		if !ok {
			apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
			return
		}
		q := url.Values{}
		for _, k := range query {
			if v := r.URL.Query().Get(k); v != "" {
				q.Set(k, v)
			}
		}
		var body io.Reader
		var size int64
		if r.Method != http.MethodGet {
			raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
			if err != nil || (len(raw) > 0 && !json.Valid(raw)) {
				apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
				return
			}
			if len(raw) > 0 {
				body, size = bytes.NewReader(raw), int64(len(raw))
			}
		}
		resp, err := s.callAdmin(r.Context(), person, r.Method, p, q, body, size)
		if err != nil {
			s.fgaDown(w, err)
			return
		}
		if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusNoContent {
			s.markAdmin(person)
		}
		relay(w, resp)
	}
}

// previewTool runs a draft data tool as the signed-in person, through
// fga's file API with their own pass (DTL-008): fga decides list on the
// source's space and every read, as for a call. The console sees the
// answer only to show it to that person.
func (s *Server) previewTool(w http.ResponseWriter, r *http.Request, person string) {
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
	if err != nil || !json.Valid(raw) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
		return
	}
	resp, err := s.call(r, person, http.MethodPost, "/v1/data-tools/preview", nil, bytes.NewReader(raw), int64(len(raw)),
		http.Header{"Content-Type": {"application/json"}})
	if err != nil {
		s.fgaDown(w, err)
		return
	}
	relay(w, resp)
}

// isAdmin asks fga's admin API whether person is an administrator.
func (s *Server) isAdmin(ctx context.Context, person string) bool {
	if s.admin == nil {
		return false
	}
	s.admins.mu.Lock()
	t, ok := s.admins.seen[person]
	s.admins.mu.Unlock()
	if ok && s.now().Sub(t) < time.Minute {
		return true
	}
	resp, err := s.callAdmin(ctx, person, http.MethodGet, "/v1/admin/whoami", nil, nil, 0)
	if err != nil {
		return false
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		s.admins.mu.Lock()
		delete(s.admins.seen, person)
		s.admins.mu.Unlock()
		return false
	}
	s.markAdmin(person)
	return true
}

func (s *Server) markAdmin(person string) {
	s.admins.mu.Lock()
	defer s.admins.mu.Unlock()
	s.admins.seen[person] = s.now()
}

// adminOnly serves the console's own administrator records only to people
// fga's admin API accepts.
func (s *Server) adminOnly(fn handler) handler {
	return func(w http.ResponseWriter, r *http.Request, person string) {
		if !s.isAdmin(r.Context(), person) {
			apiError(w, http.StatusForbidden, "NOT_AN_ADMINISTRATOR")
			return
		}
		fn(w, r, person)
	}
}

var profileID = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,47}$`)

func (s *Server) putProfiles(w http.ResponseWriter, r *http.Request, person string) {
	var body struct {
		Profiles []Profile `json:"profiles"`
	}
	if !decode(w, r, &body) {
		return
	}
	known := map[string]bool{}
	for _, rt := range Rights {
		known[rt.ID] = true
	}
	seen := map[string]bool{}
	for _, p := range body.Profiles {
		if !profileID.MatchString(p.ID) || seen[p.ID] || p.Name == "" || len(p.Name) > 80 || len(p.Help) > 200 {
			apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
			return
		}
		seen[p.ID] = true
		for _, rt := range p.Rights {
			if !known[rt] {
				apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
				return
			}
		}
	}
	if len(body.Profiles) > 100 {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
		return
	}
	if err := s.store.SetProfiles(body.Profiles); err != nil {
		apiError(w, http.StatusInternalServerError, "INTERNAL")
		return
	}
	s.log.Info("profiles changed", "by", person)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) putDraft(w http.ResponseWriter, r *http.Request, person string) {
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil || !json.Valid(raw) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
		return
	}
	if err := s.store.SetDraft(raw); err != nil {
		apiError(w, http.StatusInternalServerError, "INTERNAL")
		return
	}
	s.log.Info("rule draft saved", "by", person)
	w.WriteHeader(http.StatusNoContent)
}

// servers checks each configured service's health address.
func (s *Server) servers(w http.ResponseWriter, r *http.Request, _ string) {
	type status struct {
		Service
		OK     bool  `json:"ok"`
		Status int   `json:"status"`
		Ms     int64 `json:"ms"`
	}
	out := make([]status, len(s.cfg.Services))
	var wg sync.WaitGroup
	for i, sv := range s.cfg.Services {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
			defer cancel()
			st := status{Service: sv}
			start := s.now()
			req, _ := http.NewRequestWithContext(ctx, http.MethodGet, sv.Health, nil)
			if resp, err := s.client.Do(req); err == nil {
				resp.Body.Close()
				st.Status, st.OK = resp.StatusCode, resp.StatusCode >= 200 && resp.StatusCode < 300
			}
			st.Ms = s.now().Sub(start).Milliseconds()
			out[i] = st
		}()
	}
	wg.Wait()
	writeJSON(w, http.StatusOK, map[string]any{"services": out})
}
