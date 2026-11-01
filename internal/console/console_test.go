package console

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"
)

// fakeFGA stands in for fga's file API: it checks every pass the console
// sends and records what it was asked.
type fakeFGA struct {
	t      *testing.T
	pub    ed25519.PublicKey
	mu     sync.Mutex
	calls  []string
	grants map[string]bool // space/key|grantee
	refuse map[string]bool // keys fga answers 404 for
}

func (f *fakeFGA) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	claims := f.verify(r.Header.Get("Authorization"))
	if claims == nil {
		http.Error(w, `{"error":"UNAUTHENTICATED"}`, http.StatusUnauthorized)
		return
	}
	who := claims["sub"].(string)
	key := r.URL.Query().Get("key")
	f.mu.Lock()
	f.calls = append(f.calls, r.Method+" "+r.URL.Path+" "+who)
	f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	if f.refuse[key] || strings.Contains(r.URL.Path, "/hidden/") {
		w.WriteHeader(http.StatusNotFound)
		io.WriteString(w, `{"error":"NOT_FOUND"}`)
		return
	}
	switch {
	case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/objects"):
		io.WriteString(w, `{"entries":[{"key":"q4/plan.txt","version_id":"v1","ciphertext_length":17,"created_at":"2026-11-01T10:00:00Z"}]}`)
	case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/encryption"):
		io.WriteString(w, `{"encryption":"server"}`)
	case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/object/content"):
		w.Header().Set("Content-Type", "application/octet-stream")
		io.WriteString(w, "<script>alert(1)</script>")
	case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/grants"):
		var g struct{ Grantee string }
		_ = json.NewDecoder(r.Body).Decode(&g)
		f.mu.Lock()
		f.grants[r.URL.Path+key+"|"+g.Grantee] = true
		f.mu.Unlock()
		io.WriteString(w, `{"grant":{}}`)
	case r.Method == http.MethodDelete && strings.HasSuffix(r.URL.Path, "/grants"):
		f.mu.Lock()
		delete(f.grants, r.URL.Path+key+"|"+r.URL.Query().Get("grantee"))
		f.mu.Unlock()
		io.WriteString(w, `{"grant":{}}`)
	case r.Method == http.MethodPut && strings.HasSuffix(r.URL.Path, "/object"):
		if r.Header.Get("If-None-Match") != "*" || r.ContentLength != 5 {
			f.t.Errorf("upload: If-None-Match %q, length %d", r.Header.Get("If-None-Match"), r.ContentLength)
		}
		io.WriteString(w, `{"object_id":"o","version_id":"v","etag":"\"v\"","generation":1}`)
	default:
		io.WriteString(w, `{}`)
	}
}

// verify checks a pass as fga's file API does: type, algorithm, key,
// signature, issuer, audience, tenant and lifetime.
func (f *fakeFGA) verify(auth string) map[string]any { return f.verifyFor(auth, StorageAudience) }

func (f *fakeFGA) verifyFor(auth, audience string) map[string]any {
	tok, ok := strings.CutPrefix(auth, "Bearer ")
	parts := strings.Split(tok, ".")
	if !ok || len(parts) != 3 {
		return nil
	}
	enc := base64.RawURLEncoding
	h, _ := enc.DecodeString(parts[0])
	c, _ := enc.DecodeString(parts[1])
	sig, _ := enc.DecodeString(parts[2])
	var header map[string]string
	var claims map[string]any
	if json.Unmarshal(h, &header) != nil || json.Unmarshal(c, &claims) != nil {
		return nil
	}
	if header["typ"] != "at+jwt" || header["alg"] != "EdDSA" || header["kid"] != "tok-1" ||
		!ed25519.Verify(f.pub, []byte(parts[0]+"."+parts[1]), sig) {
		f.t.Errorf("pass header %v or signature wrong", header)
		return nil
	}
	life := claims["exp"].(float64) - claims["iat"].(float64)
	audOK := claims["aud"] == audience
	if list, ok := claims["aud"].([]any); ok {
		for _, x := range list {
			audOK = audOK || x == audience
		}
	}
	if claims["iss"] != "fga-dev" || !audOK || claims["fga_tenant"] != "t-acme" || life <= 0 || life > 3600 {
		f.t.Errorf("pass claims %v", claims)
		return nil
	}
	return claims
}

// lastReaderRefusal is fga's answer to disabling the last person who can
// open some client-mode files: counts per bucket, never a file name.
const lastReaderRefusal = `{"error":"catalog: 3 client-mode files would have no reader left (reports: 2, shared: 1); ` +
	`send {\"confirm_unreadable\": true} to make the change anyway","unreadable":[{"bucket":"reports","files":2},{"bucket":"shared","files":1}]}` + "\n"

// fakeAdmin stands in for fga's admin API: root is its only administrator.
type fakeAdmin struct {
	f     *fakeFGA
	mu    sync.Mutex
	calls []string
}

func (a *fakeAdmin) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	claims := a.f.verifyFor(r.Header.Get("Authorization"), "fga-admin")
	w.Header().Set("Content-Type", "application/json")
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		io.WriteString(w, `{"error":"the token does not verify"}`)
		return
	}
	if claims["sub"] != "root" {
		w.WriteHeader(http.StatusForbidden)
		io.WriteString(w, `{"error":"not an administrator of this tenant"}`)
		return
	}
	body, _ := io.ReadAll(r.Body)
	a.mu.Lock()
	a.calls = append(a.calls, r.Method+" "+r.URL.Path+" "+string(body))
	a.mu.Unlock()
	switch {
	case r.URL.Path == "/v1/admin/whoami":
		io.WriteString(w, `{"tenant":"t-acme","subject":"root","console":"console-dev"}`)
	case r.URL.Path == "/v1/admin/identities":
		io.WriteString(w, `{"items":[{"id":"alice","roles":["member"],"attributes":{"projects":["p1"]},"disabled":false,"capabilities":{}}]}`)
	case r.Method == http.MethodPut:
		w.WriteHeader(http.StatusNoContent)
	case strings.HasSuffix(r.URL.Path, "/disable"):
		// Every person here is the last reader of some client-mode files,
		// so fga disables them only when the change is confirmed.
		if string(body) == `{"confirm_unreadable":true}` {
			w.WriteHeader(http.StatusNoContent)
		} else {
			w.WriteHeader(http.StatusConflict)
			io.WriteString(w, lastReaderRefusal)
		}
	default:
		io.WriteString(w, `{}`)
	}
}

type env struct {
	t       *testing.T
	admin   *fakeAdmin
	fga     *fakeFGA
	console *httptest.Server
	client  *http.Client
}

func newEnv(t *testing.T) *env {
	t.Helper()
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	dir := t.TempDir()
	keyFile := filepath.Join(dir, "issuer.key")
	if err := os.WriteFile(keyFile, []byte(base64.StdEncoding.EncodeToString(priv)), 0o600); err != nil {
		t.Fatal(err)
	}
	f := &fakeFGA{t: t, pub: pub, grants: map[string]bool{}, refuse: map[string]bool{}}
	fga := httptest.NewServer(f)
	t.Cleanup(fga.Close)
	adm := &fakeAdmin{f: f}
	admin := httptest.NewServer(adm)
	t.Cleanup(admin.Close)
	cfg := &Config{Version: 1, Listen: "127.0.0.1:0", Tenant: "t-acme", StorageURL: fga.URL, Spaces: []string{"shared", "hidden"},
		AdminURL: admin.URL, AdminAudience: "fga-admin", DataDir: filepath.Join(dir, "data"), SessionHours: 8, MaxUploadMB: 1,
		DevSignIn: &DevSignIn{Issuer: "fga-dev", KeyID: "tok-1", KeyFile: keyFile, People: []string{"alice", "carl", "root"}}}
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}
	web := fstest.MapFS{"index.html": {Data: []byte("<!doctype html><title>fga console</title>")}}
	s, err := New(cfg, web, http.DefaultClient, slog.New(slog.NewTextHandler(io.Discard, nil)), time.Now)
	if err != nil {
		t.Fatal(err)
	}
	console := httptest.NewServer(s.Handler())
	t.Cleanup(console.Close)
	jar, _ := cookiejar.New(nil)
	return &env{t: t, admin: adm, fga: f, console: console, client: &http.Client{Jar: jar}}
}

// do sends a request as the console's own pages do.
func (e *env) do(method, path, body string) (*http.Response, string) {
	e.t.Helper()
	req, _ := http.NewRequest(method, e.console.URL+path, strings.NewReader(body))
	if method != http.MethodGet {
		req.Header.Set("X-Fga-Console", "1")
	}
	resp, err := e.client.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp, string(raw)
}

func (e *env) signIn(person string) {
	e.t.Helper()
	if resp, body := e.do(http.MethodPost, "/api/signin", `{"person":"`+person+`"}`); resp.StatusCode != http.StatusOK {
		e.t.Fatalf("sign-in: %d %s", resp.StatusCode, body)
	}
}

func TestPassFormat(t *testing.T) {
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	m := NewMinter("fga-dev", "tok-1", "t-acme", priv, time.Now)
	if _, err := m.Pass("alice", StorageAudience, 2*time.Hour); err == nil {
		t.Fatal("a pass longer than fga accepts was minted")
	}
	f := &fakeFGA{t: t, pub: priv.Public().(ed25519.PublicKey)}
	p, err := m.Pass("alice", StorageAudience, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if c := f.verify("Bearer " + p); c == nil || c["sub"] != "alice" {
		t.Fatalf("claims %v", c)
	}
}

func TestConfigRefusesDevSignInOffLoopback(t *testing.T) {
	cfg := &Config{Version: 1, Listen: "0.0.0.0:8080", Tenant: "t", StorageURL: "http://10.0.0.5:28441", Spaces: []string{"shared"},
		DataDir: "d", SessionHours: 8, MaxUploadMB: 1, DevSignIn: &DevSignIn{Issuer: "i", KeyID: "k", KeyFile: "f", People: []string{"a"}}}
	err := cfg.Validate()
	if err == nil || !strings.Contains(err.Error(), "dev_signin is allowed only") || !strings.Contains(err.Error(), "plain http only") {
		t.Fatalf("got %v", err)
	}
}

func TestSignInAndSession(t *testing.T) {
	e := newEnv(t)
	if resp, _ := e.do(http.MethodGet, "/api/spaces", ""); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("without a session: %d", resp.StatusCode)
	}
	if resp, _ := e.do(http.MethodPost, "/api/signin", `{"person":"mallory"}`); resp.StatusCode != http.StatusForbidden {
		t.Fatalf("an unlisted person signed in: %d", resp.StatusCode)
	}
	resp, _ := e.do(http.MethodPost, "/api/signin", `{"person":"alice"}`)
	c := resp.Cookies()
	if len(c) != 1 || !c[0].HttpOnly || c[0].SameSite != http.SameSiteStrictMode || len(c[0].Value) < 40 {
		t.Fatalf("session cookie %+v", c)
	}
	if _, body := e.do(http.MethodGet, "/api/session", ""); !strings.Contains(body, `"person":"alice"`) {
		t.Fatalf("session %s", body)
	}
	e.do(http.MethodPost, "/api/signout", "")
	if resp, _ := e.do(http.MethodGet, "/api/spaces", ""); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("after sign-out: %d", resp.StatusCode)
	}
}

func TestChangesNeedTheConsoleHeader(t *testing.T) {
	e := newEnv(t)
	e.signIn("alice")
	req, _ := http.NewRequest(http.MethodDelete, e.console.URL+"/api/files?space=shared&key=q4/plan.txt", nil)
	resp, _ := e.client.Do(req)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("a change without the header: %d", resp.StatusCode)
	}
	req, _ = http.NewRequest(http.MethodDelete, e.console.URL+"/api/files?space=shared&key=q4/plan.txt", nil)
	req.Header.Set("X-Fga-Console", "1")
	req.Header.Set("Origin", "https://evil.example")
	if resp, _ := e.client.Do(req); resp.StatusCode != http.StatusForbidden {
		t.Fatalf("a change from another origin: %d", resp.StatusCode)
	}
	for _, c := range e.fga.calls {
		if strings.HasPrefix(c, "DELETE") {
			t.Fatalf("fga was asked to delete: %v", e.fga.calls)
		}
	}
}

func TestSpacesAreDecidedByFGA(t *testing.T) {
	e := newEnv(t)
	e.signIn("carl")
	_, body := e.do(http.MethodGet, "/api/spaces", "")
	if !strings.Contains(body, `"name":"shared","encryption":"server"`) || strings.Contains(body, "hidden") {
		t.Fatalf("spaces %s", body)
	}
	for _, c := range e.fga.calls {
		if !strings.HasSuffix(c, " carl") {
			t.Fatalf("a call without carl's own pass: %s", c)
		}
	}
}

func TestFGARefusalPassesThrough(t *testing.T) {
	e := newEnv(t)
	e.signIn("carl")
	e.fga.refuse["q4/plan.txt"] = true
	resp, body := e.do(http.MethodGet, "/api/files/content?space=shared&key=q4/plan.txt", "")
	if resp.StatusCode != http.StatusNotFound || !strings.Contains(body, "NOT_FOUND") {
		t.Fatalf("%d %s", resp.StatusCode, body)
	}
}

func TestDownloadIsNeverShownAsAPage(t *testing.T) {
	e := newEnv(t)
	e.signIn("alice")
	resp, body := e.do(http.MethodGet, "/api/files/content?space=shared&key=q4/"+url.PathEscape("plan \"x\".html"), "")
	if resp.StatusCode != http.StatusOK || body != "<script>alert(1)</script>" {
		t.Fatalf("%d %s", resp.StatusCode, body)
	}
	h := resp.Header
	if h.Get("Content-Type") != "application/octet-stream" || !strings.HasPrefix(h.Get("Content-Disposition"), `attachment; filename="plan__x_.html"`) ||
		h.Get("X-Content-Type-Options") != "nosniff" || !strings.Contains(h.Get("Content-Security-Policy"), "default-src 'none'") {
		t.Fatalf("headers %v", h)
	}
}

func TestBadInputNeverReachesFGA(t *testing.T) {
	e := newEnv(t)
	e.signIn("alice")
	for _, p := range []string{"/api/files?space=../x", "/api/files/content?space=shared&key=", "/api/files/content?space=Shared&key=a"} {
		if resp, _ := e.do(http.MethodGet, p, ""); resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("%s: %d", p, resp.StatusCode)
		}
	}
	if resp, _ := e.do(http.MethodPost, "/api/shares", `{"grantee":"alice","actions":["read"],"days":7,"files":[{"space":"shared","key":"a"}]}`); resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("sharing with oneself: %d", resp.StatusCode)
	}
	if resp, _ := e.do(http.MethodPost, "/api/shares", `{"grantee":"carl","actions":["delete"],"days":7,"files":[{"space":"shared","key":"a"}]}`); resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("an action shares cannot give: %d", resp.StatusCode)
	}
	if len(e.fga.calls) != 0 {
		t.Fatalf("fga was called: %v", e.fga.calls)
	}
}

func TestUploadNeverOverwrites(t *testing.T) {
	e := newEnv(t)
	e.signIn("alice")
	if resp, body := e.do(http.MethodPut, "/api/files?space=shared&key=q4/new.txt", "hello"); resp.StatusCode != http.StatusOK {
		t.Fatalf("%d %s", resp.StatusCode, body)
	}
	if resp, _ := e.do(http.MethodPut, "/api/files?space=shared&key=q4/big.bin", strings.Repeat("x", 2<<20)); resp.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("an upload above max_upload_mb: %d", resp.StatusCode)
	}
}

func TestGiveAccessAndTakeBackABatch(t *testing.T) {
	e := newEnv(t)
	e.signIn("alice")
	e.fga.refuse["q4/secret.txt"] = true
	_, body := e.do(http.MethodPost, "/api/shares",
		`{"grantee":"carl","actions":["read","stat"],"days":7,"files":[{"space":"shared","key":"q4/plan.txt"},{"space":"shared","key":"q4/notes.md"},{"space":"shared","key":"q4/secret.txt"}]}`)
	var out struct {
		Batch   string
		Results []struct {
			Key    string
			Status int
			Error  string
		}
	}
	if err := json.Unmarshal([]byte(body), &out); err != nil || out.Batch == "" || len(out.Results) != 3 || out.Results[2].Error != "NOT_FOUND" {
		t.Fatalf("give access: %s", body)
	}
	if len(e.fga.grants) != 2 {
		t.Fatalf("grants at fga: %v", e.fga.grants)
	}
	if _, body := e.do(http.MethodGet, "/api/batches", ""); !strings.Contains(body, `"grantee":"carl"`) || strings.Contains(body, "secret") {
		t.Fatalf("batches %s", body)
	}
	e.signIn("carl")
	if resp, _ := e.do(http.MethodPost, "/api/batches/"+out.Batch+"/take-back", ""); resp.StatusCode != http.StatusNotFound {
		t.Fatalf("carl took back alice's batch: %d", resp.StatusCode)
	}
	e.signIn("alice")
	if _, body := e.do(http.MethodPost, "/api/batches/"+out.Batch+"/take-back", ""); !strings.Contains(body, `"taken_back":2`) {
		t.Fatalf("take back %s", body)
	}
	if len(e.fga.grants) != 0 {
		t.Fatalf("grants left at fga: %v", e.fga.grants)
	}
	if _, body := e.do(http.MethodGet, "/api/batches", ""); strings.Contains(body, out.Batch) {
		t.Fatalf("an empty batch is still listed: %s", body)
	}
}

func TestAdministratorsAreDecidedByFGA(t *testing.T) {
	e := newEnv(t)
	e.signIn("alice")
	if _, body := e.do(http.MethodGet, "/api/session", ""); !strings.Contains(body, `"admin":false`) {
		t.Fatalf("alice's session %s", body)
	}
	if resp, body := e.do(http.MethodGet, "/api/admin/people", ""); resp.StatusCode != http.StatusForbidden || !strings.Contains(body, "not an administrator") {
		t.Fatalf("alice listing people: %d %s", resp.StatusCode, body)
	}
	if resp, _ := e.do(http.MethodGet, "/api/admin/rights", ""); resp.StatusCode != http.StatusForbidden {
		t.Fatalf("alice reading the console's admin records: %d", resp.StatusCode)
	}
	if resp, _ := e.do(http.MethodGet, "/api/admin/servers", ""); resp.StatusCode != http.StatusForbidden {
		t.Fatalf("alice reading server health: %d", resp.StatusCode)
	}
	e.signIn("root")
	if _, body := e.do(http.MethodGet, "/api/session", ""); !strings.Contains(body, `"admin":true`) {
		t.Fatalf("root's session %s", body)
	}
	if resp, body := e.do(http.MethodGet, "/api/admin/people?limit=50&secret=x", ""); resp.StatusCode != http.StatusOK || !strings.Contains(body, `"id":"alice"`) {
		t.Fatalf("root listing people: %d %s", resp.StatusCode, body)
	}
	if _, body := e.do(http.MethodGet, "/api/admin/rights", ""); !strings.Contains(body, `"id":"share"`) || !strings.Contains(body, `"profiles"`) {
		t.Fatalf("rights %s", body)
	}
}

func TestAdminChangesAreForwardedAsTheyAre(t *testing.T) {
	e := newEnv(t)
	e.signIn("root")
	if resp, _ := e.do(http.MethodPut, "/api/admin/people/carl", `{"roles":["member"],"attributes":{"projects":["p1","p2"]}}`); resp.StatusCode != http.StatusNoContent {
		t.Fatalf("put: %d", resp.StatusCode)
	}
	for _, bad := range []string{"/api/admin/people/" + url.PathEscape("a/b"), "/api/admin/people/" + url.PathEscape("a b")} {
		if resp, _ := e.do(http.MethodPut, bad, `{}`); resp.StatusCode != http.StatusBadRequest && resp.StatusCode != http.StatusNotFound {
			t.Fatalf("%s: %d", bad, resp.StatusCode)
		}
	}
	if resp, _ := e.do(http.MethodPut, "/api/admin/people/carl", `{not json`); resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid JSON: %d", resp.StatusCode)
	}
	var puts []string
	for _, c := range e.admin.calls {
		if strings.HasPrefix(c, "PUT") {
			puts = append(puts, c)
		}
	}
	if len(puts) != 1 || puts[0] != `PUT /v1/admin/identities/carl {"roles":["member"],"attributes":{"projects":["p1","p2"]}}` {
		t.Fatalf("admin API saw %q", puts)
	}
}

// The console passes fga's last-reader refusal back as fga sent it, so the
// page can show the counts, and the page's confirmation on as it was sent.
func TestDisablingTheLastReaderNeedsConfirming(t *testing.T) {
	e := newEnv(t)
	e.signIn("root")
	resp, body := e.do(http.MethodPost, "/api/admin/people/carl/disable", "")
	if resp.StatusCode != http.StatusConflict || resp.Header.Get("Content-Type") != "application/json" || body != lastReaderRefusal {
		t.Fatalf("unconfirmed: %d %q %s", resp.StatusCode, resp.Header.Get("Content-Type"), body)
	}
	if resp, body := e.do(http.MethodPost, "/api/admin/people/carl/disable", `{"confirm_unreadable":true}`); resp.StatusCode != http.StatusNoContent {
		t.Fatalf("confirmed: %d %s", resp.StatusCode, body)
	}
	var disables []string
	for _, c := range e.admin.calls {
		if strings.HasSuffix(strings.Fields(c)[1], "/disable") {
			disables = append(disables, c)
		}
	}
	want := []string{"POST /v1/admin/identities/carl/disable ", `POST /v1/admin/identities/carl/disable {"confirm_unreadable":true}`}
	if len(disables) != 2 || disables[0] != want[0] || disables[1] != want[1] {
		t.Fatalf("admin API saw %q", disables)
	}
}

func TestProfilesNameOnlyKnownRights(t *testing.T) {
	e := newEnv(t)
	e.signIn("root")
	if resp, _ := e.do(http.MethodPut, "/api/admin/profiles", `{"profiles":[{"id":"x","name":"X","rights":["fly"]}]}`); resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("an unknown right: %d", resp.StatusCode)
	}
	if resp, _ := e.do(http.MethodPut, "/api/admin/profiles", `{"profiles":[{"id":"viewer","name":"Viewer","rights":["open"]}]}`); resp.StatusCode != http.StatusNoContent {
		t.Fatalf("a valid profile: %d", resp.StatusCode)
	}
	if _, body := e.do(http.MethodGet, "/api/admin/rights", ""); !strings.Contains(body, `"id":"viewer"`) || strings.Contains(body, `"id":"steward"`) {
		t.Fatalf("profiles after the change %s", body)
	}
}
