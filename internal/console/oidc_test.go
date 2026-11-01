package console

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"io"
	"log/slog"
	"math/big"
	"net"
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

// fakeIdP stands in for the organisation's login: discovery, a key set,
// authorize (which signs alice in at once), and a token endpoint that
// checks the client, the code, PKCE and refresh tokens. Its ID tokens are
// RS256; its access tokens are what fga accepts (EdDSA, at+jwt).
type fakeIdP struct {
	t        *testing.T
	srv      *httptest.Server
	rsaKey   *rsa.PrivateKey
	fgaKey   ed25519.PrivateKey
	mu       sync.Mutex
	codes    map[string][2]string // code -> nonce, challenge
	lifetime int64
	refresh  int
	// spoil makes the ID token wrong: "nonce", "aud" or "sig".
	spoil        string
	refuseRenew  bool
	accessIssued []string
}

func newFakeIdP(t *testing.T, fgaKey ed25519.PrivateKey) *fakeIdP {
	k, _ := rsa.GenerateKey(rand.Reader, 2048)
	p := &fakeIdP{t: t, rsaKey: k, fgaKey: fgaKey, codes: map[string][2]string{}, lifetime: 3600}
	p.srv = httptest.NewServer(p)
	t.Cleanup(p.srv.Close)
	return p
}

func (p *fakeIdP) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	base := p.srv.URL
	switch r.URL.Path {
	case "/.well-known/openid-configuration":
		json.NewEncoder(w).Encode(map[string]string{"issuer": base, "authorization_endpoint": base + "/authorize",
			"token_endpoint": base + "/token", "jwks_uri": base + "/jwks", "end_session_endpoint": base + "/logout"})
	case "/jwks":
		n := base64.RawURLEncoding.EncodeToString(p.rsaKey.N.Bytes())
		e := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(p.rsaKey.E)).Bytes())
		json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{"kty": "RSA", "kid": "idp-1", "n": n, "e": e}}})
	case "/authorize":
		q := r.URL.Query()
		if q.Get("code_challenge_method") != "S256" || q.Get("response_type") != "code" || q.Get("client_id") != "fga-console" || q.Get("audience") != "fga" {
			p.t.Errorf("authorize request %v", q)
		}
		code := hex.EncodeToString(randBytes(8))
		p.mu.Lock()
		p.codes[code] = [2]string{q.Get("nonce"), q.Get("code_challenge")}
		p.mu.Unlock()
		http.Redirect(w, r, q.Get("redirect_uri")+"?code="+code+"&state="+url.QueryEscape(q.Get("state")), http.StatusFound)
	case "/token":
		if id, secret, ok := r.BasicAuth(); !ok || id != "fga-console" || secret != "s3cret" {
			http.Error(w, `{"error":"invalid_client"}`, http.StatusUnauthorized)
			return
		}
		r.ParseForm()
		switch r.Form.Get("grant_type") {
		case "authorization_code":
			p.mu.Lock()
			c, ok := p.codes[r.Form.Get("code")]
			delete(p.codes, r.Form.Get("code"))
			p.mu.Unlock()
			sum := sha256.Sum256([]byte(r.Form.Get("code_verifier")))
			if !ok || base64.RawURLEncoding.EncodeToString(sum[:]) != c[1] {
				http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
				return
			}
			p.tokens(w, c[0])
		case "refresh_token":
			p.mu.Lock()
			p.refresh++
			refuse := p.refuseRenew
			p.mu.Unlock()
			if refuse || r.Form.Get("refresh_token") != "refresh-1" {
				http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
				return
			}
			p.tokens(w, "")
		}
	}
}

func randBytes(n int) []byte { b := make([]byte, n); rand.Read(b); return b }

func (p *fakeIdP) tokens(w http.ResponseWriter, nonce string) {
	now := time.Now()
	idc := map[string]any{"iss": p.srv.URL, "sub": "alice", "aud": "fga-console", "exp": now.Add(time.Hour).Unix(), "iat": now.Unix(),
		"nonce": nonce, "name": "Alice Example"}
	if p.spoil == "nonce" {
		idc["nonce"] = "other"
	}
	if p.spoil == "aud" {
		idc["aud"] = "someone-else"
	}
	enc := base64.RawURLEncoding
	h, _ := json.Marshal(map[string]string{"alg": "RS256", "kid": "idp-1", "typ": "JWT"})
	c, _ := json.Marshal(idc)
	in := enc.EncodeToString(h) + "." + enc.EncodeToString(c)
	sum := sha256.Sum256([]byte(in))
	sig, _ := rsa.SignPKCS1v15(rand.Reader, p.rsaKey, crypto.SHA256, sum[:])
	if p.spoil == "sig" {
		sig[0] ^= 1
	}
	at := signAccess(p.fgaKey, "alice", []string{"fga-storage", "fga-admin"}, p.lifetime)
	p.mu.Lock()
	p.accessIssued = append(p.accessIssued, at)
	p.mu.Unlock()
	json.NewEncoder(w).Encode(map[string]any{"access_token": at, "refresh_token": "refresh-1", "id_token": in + "." + enc.EncodeToString(sig),
		"token_type": "Bearer", "expires_in": p.lifetime})
}

// signAccess makes an access token in the shape fga accepts.
func signAccess(key ed25519.PrivateKey, sub string, aud []string, life int64) string {
	enc := base64.RawURLEncoding
	now := time.Now()
	h, _ := json.Marshal(map[string]string{"alg": "EdDSA", "kid": "tok-1", "typ": "at+jwt"})
	c, _ := json.Marshal(map[string]any{"iss": "fga-dev", "sub": sub, "aud": aud, "jti": hex.EncodeToString(randBytes(8)),
		"iat": now.Unix(), "exp": now.Add(time.Duration(life) * time.Second).Unix(), "fga_tenant": "t-acme"})
	in := enc.EncodeToString(h) + "." + enc.EncodeToString(c)
	return in + "." + enc.EncodeToString(ed25519.Sign(key, []byte(in)))
}

type oidcEnv struct {
	*env
	idp *fakeIdP
}

func newOIDCEnv(t *testing.T) *oidcEnv {
	t.Helper()
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	dir := t.TempDir()
	secret := filepath.Join(dir, "secret")
	os.WriteFile(secret, []byte("s3cret\n"), 0o600)
	f := &fakeFGA{t: t, pub: pub, grants: map[string]bool{}, refuse: map[string]bool{}}
	fga := httptest.NewServer(f)
	t.Cleanup(fga.Close)
	adm := &fakeAdmin{f: f}
	admin := httptest.NewServer(adm)
	t.Cleanup(admin.Close)
	idp := newFakeIdP(t, priv)
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	public := "http://" + ln.Addr().String()
	cfg := &Config{Version: 1, Listen: ln.Addr().String(), PublicURL: public, Tenant: "t-acme", StorageURL: fga.URL, AdminURL: admin.URL,
		Spaces: []string{"shared"}, DataDir: filepath.Join(dir, "data"),
		OIDC: &OIDC{Issuer: idp.srv.URL, ClientID: "fga-console", ClientSecretFile: secret, AuthParams: map[string]string{"audience": "fga"}}}
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}
	web := fstest.MapFS{"index.html": {Data: []byte("<!doctype html><title>fga console</title>")}}
	s, err := New(cfg, web, http.DefaultClient, slog.New(slog.NewTextHandler(io.Discard, nil)), time.Now)
	if err != nil {
		t.Fatal(err)
	}
	console := httptest.NewUnstartedServer(s.Handler())
	console.Listener.Close()
	console.Listener = ln
	console.Start()
	t.Cleanup(console.Close)
	jar, _ := cookiejar.New(nil)
	return &oidcEnv{env: &env{t: t, admin: adm, fga: f, console: console, client: &http.Client{Jar: jar}}, idp: idp}
}

func (e *oidcEnv) signIn() *http.Response {
	e.t.Helper()
	resp, err := e.client.Get(e.console.URL + "/auth/login")
	if err != nil {
		e.t.Fatal(err)
	}
	resp.Body.Close()
	return resp
}

func TestOIDCSignIn(t *testing.T) {
	e := newOIDCEnv(t)
	if resp, _ := e.do(http.MethodPost, "/api/signin", `{"person":"alice"}`); resp.StatusCode != http.StatusNotFound && resp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("development sign-in is open beside the organisation's login: %d", resp.StatusCode)
	}
	if resp := e.signIn(); resp.StatusCode != http.StatusOK || resp.Request.URL.Path != "/" {
		t.Fatalf("sign-in ended at %s with %d", resp.Request.URL, resp.StatusCode)
	}
	_, body := e.do(http.MethodGet, "/api/session", "")
	if !strings.Contains(body, `"person":"alice"`) || !strings.Contains(body, `"name":"Alice Example"`) || !strings.Contains(body, `"admin":false`) {
		t.Fatalf("session %s", body)
	}
	if resp, body := e.do(http.MethodGet, "/api/spaces", ""); resp.StatusCode != http.StatusOK || !strings.Contains(body, "shared") {
		t.Fatalf("spaces: %d %s", resp.StatusCode, body)
	}
	if len(e.fga.calls) == 0 || !strings.HasSuffix(e.fga.calls[0], " alice") {
		t.Fatalf("fga calls %v", e.fga.calls)
	}
}

func TestOIDCRefusesAForeignOrSpoiledSignIn(t *testing.T) {
	e := newOIDCEnv(t)
	resp, err := e.client.Get(e.console.URL + "/auth/callback?code=x&state=not-mine")
	if err != nil || resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("a callback this browser did not start: %v %d", err, resp.StatusCode)
	}
	for _, spoil := range []string{"nonce", "aud", "sig"} {
		e.idp.spoil = spoil
		if resp := e.signIn(); resp.StatusCode != http.StatusBadGateway {
			t.Fatalf("an ID token with a wrong %s: %d", spoil, resp.StatusCode)
		}
		if _, body := e.do(http.MethodGet, "/api/session", ""); !strings.Contains(body, `"signed_in":false`) {
			t.Fatalf("an ID token with a wrong %s signed someone in: %s", spoil, body)
		}
	}
}

func TestOIDCRenewsThePass(t *testing.T) {
	e := newOIDCEnv(t)
	e.idp.lifetime = 30 // under a minute: every call renews it
	e.signIn()
	e.do(http.MethodGet, "/api/spaces", "")
	if e.idp.refresh == 0 || len(e.idp.accessIssued) < 2 {
		t.Fatalf("the pass was not renewed: %d renewals", e.idp.refresh)
	}
	e.idp.refuseRenew = true
	if resp, _ := e.do(http.MethodGet, "/api/spaces", ""); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("a sign-in that can no longer be renewed: %d", resp.StatusCode)
	}
}

func TestSignOutGoesToTheLoginServicesSignOut(t *testing.T) {
	e := newOIDCEnv(t)
	e.signIn()
	_, body := e.do(http.MethodPost, "/api/signout", "")
	var out struct {
		LogoutURL string `json:"logout_url"`
	}
	json.Unmarshal([]byte(body), &out)
	u, err := url.Parse(out.LogoutURL)
	if err != nil || !strings.HasPrefix(out.LogoutURL, e.idp.srv.URL+"/logout?") || u.Query().Get("id_token_hint") == "" ||
		u.Query().Get("post_logout_redirect_uri") != e.console.URL+"/" {
		t.Fatalf("logout url %q", out.LogoutURL)
	}
	if _, body := e.do(http.MethodGet, "/api/session", ""); !strings.Contains(body, `"signed_in":false`) {
		t.Fatalf("still signed in: %s", body)
	}
}

func TestProductionRefusesUnsafeSettings(t *testing.T) {
	cfg := &Config{Version: 1, Profile: "production", Listen: "0.0.0.0:443", Tenant: "t", StorageURL: "http://fga:28441", AdminURL: "http://fga:8450",
		Spaces: []string{"shared"}, DataDir: "d", DevSignIn: &DevSignIn{Issuer: "i", KeyID: "k", KeyFile: "f", People: []string{"a"}}}
	err := cfg.Validate()
	for _, want := range []string{"storage_url must use https", "admin_url must use https", "production needs tls", "production needs fga_tls",
		"dev_signin is not allowed in production"} {
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("want %q in %v", want, err)
		}
	}
	good := &Config{Version: 1, Profile: "production", Listen: "0.0.0.0:443", PublicURL: "https://console.example.org", Tenant: "t",
		StorageURL: "https://fga:28441", AdminURL: "https://fga:8450", Spaces: []string{"shared"}, DataDir: "d",
		TLS: &ServerTLS{CertFile: "c", KeyFile: "k"}, FGATLS: &ClientTLS{CAFile: "ca", CertFile: "c", KeyFile: "k"},
		OIDC: &OIDC{Issuer: "https://login.example.org/", ClientID: "fga-console", ClientSecretFile: "s"}}
	if err := good.Validate(); err != nil {
		t.Fatalf("a sound production configuration: %v", err)
	}
}

// TestConsoleCertificateReachesFGA checks that the console presents its
// certificate, whose URI names it to fga's admin API, and trusts only fga's
// CA.
func TestConsoleCertificateReachesFGA(t *testing.T) {
	dir := t.TempDir()
	caKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	caTpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "fga test CA"}, NotBefore: time.Now().Add(-time.Hour),
		NotAfter: time.Now().Add(time.Hour), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign}
	caDER, _ := x509.CreateCertificate(rand.Reader, caTpl, caTpl, &caKey.PublicKey, caKey)
	ca, _ := x509.ParseCertificate(caDER)
	issue := func(name string, serial int64, server bool) (string, string) {
		key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		tpl := &x509.Certificate{SerialNumber: big.NewInt(serial), Subject: pkix.Name{CommonName: name}, NotBefore: time.Now().Add(-time.Hour),
			NotAfter: time.Now().Add(time.Hour), KeyUsage: x509.KeyUsageDigitalSignature}
		if server {
			tpl.IPAddresses = []net.IP{net.ParseIP("127.0.0.1")}
			tpl.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}
		} else {
			u, _ := url.Parse("spiffe://example.org/fga-console")
			tpl.URIs = []*url.URL{u}
			tpl.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}
		}
		der, _ := x509.CreateCertificate(rand.Reader, tpl, ca, &key.PublicKey, caKey)
		kder, _ := x509.MarshalECPrivateKey(key)
		c, k := filepath.Join(dir, name+".crt"), filepath.Join(dir, name+".key")
		os.WriteFile(c, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0o600)
		os.WriteFile(k, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: kder}), 0o600)
		return c, k
	}
	caFile := filepath.Join(dir, "ca.crt")
	os.WriteFile(caFile, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caDER}), 0o600)
	srvCert, srvKey := issue("fga", 2, true)
	cliCert, cliKey := issue("console", 3, false)
	pool := x509.NewCertPool()
	pool.AddCert(ca)
	var seen string
	fga := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r.TLS.VerifiedChains[0][0].URIs[0].String()
	}))
	pair, _ := tls.LoadX509KeyPair(srvCert, srvKey)
	fga.TLS = &tls.Config{Certificates: []tls.Certificate{pair}, ClientAuth: tls.RequireAndVerifyClientCert, ClientCAs: pool, MinVersion: tls.VersionTLS13}
	fga.StartTLS()
	defer fga.Close()
	client, err := NewFGAClient(&ClientTLS{CAFile: caFile, CertFile: cliCert, KeyFile: cliKey})
	if err != nil {
		t.Fatal(err)
	}
	if resp, err := client.Get(fga.URL); err != nil {
		t.Fatal(err)
	} else {
		resp.Body.Close()
	}
	if seen != "spiffe://example.org/fga-console" {
		t.Fatalf("fga saw %q", seen)
	}
	bare, _ := NewFGAClient(&ClientTLS{CAFile: caFile})
	if _, err := bare.Get(fga.URL); err == nil {
		t.Fatal("fga accepted a console without its certificate")
	}
	other := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer other.Close()
	if _, err := client.Get(other.URL); err == nil {
		t.Fatal("the console trusted a server outside fga's CA")
	}
}

// TestOIDCSignInFinishesOnlyInItsOwnBrowser checks that a sign-in started
// in one browser cannot be finished in another, which would sign that
// browser in as someone else.
func TestOIDCSignInFinishesOnlyInItsOwnBrowser(t *testing.T) {
	e := newOIDCEnv(t)
	stop := func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	a := &http.Client{Jar: e.client.Jar, CheckRedirect: stop}
	resp, err := a.Get(e.console.URL + "/auth/login")
	if err != nil || resp.StatusCode != http.StatusFound {
		t.Fatalf("login: %v", err)
	}
	resp, err = a.Get(resp.Header.Get("Location"))
	if err != nil || resp.StatusCode != http.StatusFound {
		t.Fatalf("authorize: %v", err)
	}
	callback := resp.Header.Get("Location")
	jar, _ := cookiejar.New(nil)
	b := &http.Client{Jar: jar, CheckRedirect: stop}
	if _, err := b.Get(e.console.URL + "/auth/login"); err != nil { // b holds a sign-in cookie of its own
		t.Fatal(err)
	}
	if resp, err := b.Get(callback); err != nil || resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("another browser finished the sign-in: %v %d", err, resp.StatusCode)
	}
}
