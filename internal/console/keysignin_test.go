package console

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

// signInKey is a person's sign-in key, as their add-on holds it.
type signInKey struct {
	person string
	priv   ed25519.PrivateKey
	fp     string
}

func newSignInKey(t *testing.T, f *fakeFGA, person string) signInKey {
	t.Helper()
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	sum := sha256.Sum256(append([]byte("fga.sign-in-key/v1\x00"), pub...))
	k := signInKey{person: person, priv: priv, fp: "sha256:" + hex.EncodeToString(sum[:])}
	if f.signInKeys == nil {
		f.signInKeys = map[string]ed25519.PublicKey{}
	}
	f.signInKeys[k.fp] = pub
	return k
}

// pass signs a pass as the add-on does (mosaic-key-store docs/sign-in.md).
func (k signInKey) pass(audience string, now time.Time, life time.Duration, change func(map[string]any)) string {
	enc := base64.RawURLEncoding
	h, _ := json.Marshal(map[string]string{"typ": "at+jwt", "alg": "EdDSA", "kid": k.fp})
	c := map[string]any{"iss": keySignInIssuer, "sub": k.person, "aud": audience, "fga_tenant": "t-acme", "client_id": "mosaic-key-store",
		"jti": "j-" + audience, "iat": now.Unix(), "nbf": now.Unix(), "exp": now.Add(life).Unix()}
	if change != nil {
		change(c)
	}
	cb, _ := json.Marshal(c)
	in := enc.EncodeToString(h) + "." + enc.EncodeToString(cb)
	return in + "." + enc.EncodeToString(ed25519.Sign(k.priv, []byte(in)))
}

func (k signInKey) passes(now time.Time) string {
	b, _ := json.Marshal(map[string]any{"passes": map[string]string{
		StorageAudience: k.pass(StorageAudience, now, 5*time.Minute, nil), "fga-admin": k.pass("fga-admin", now, 5*time.Minute, nil)}})
	return string(b)
}

// clock is a test clock the console reads.
type clock struct {
	mu sync.Mutex
	at time.Time
}

func (c *clock) now() time.Time      { c.mu.Lock(); defer c.mu.Unlock(); return c.at }
func (c *clock) add(d time.Duration) { c.mu.Lock(); defer c.mu.Unlock(); c.at = c.at.Add(d) }

// keyEnv is a console with key sign-in on and development sign-in off.
func keyEnv(t *testing.T) (*env, *clock) {
	c := &clock{at: time.Now()}
	e := newEnvWith(t, func(cfg *Config) { cfg.KeySignIn, cfg.DevSignIn = true, nil }, c.now)
	return e, c
}

func TestKeySignIn(t *testing.T) {
	e, c := keyEnv(t)
	k := newSignInKey(t, e.fga, "alice")
	if _, body := e.do(http.MethodGet, "/api/session", ""); !strings.Contains(body, `"key_sign_in":true`) || strings.Contains(body, `"people"`) {
		t.Fatalf("session before sign-in %s", body)
	}
	if resp, _ := e.do(http.MethodPost, "/api/signin", `{"person":"alice"}`); resp.StatusCode == http.StatusOK {
		t.Fatal("development sign-in is open beside key sign-in")
	}
	if resp, body := e.do(http.MethodPost, "/api/signin/keys", k.passes(c.now())); resp.StatusCode != http.StatusOK || !strings.Contains(body, `"person":"alice"`) {
		t.Fatalf("key sign-in: %d %s", resp.StatusCode, body)
	}
	if _, body := e.do(http.MethodGet, "/api/session", ""); !strings.Contains(body, `"person":"alice"`) || !strings.Contains(body, `"with_key":true`) ||
		!strings.Contains(body, `"passes_until"`) {
		t.Fatalf("session %s", body)
	}
	if resp, body := e.do(http.MethodGet, "/api/spaces", ""); resp.StatusCode != http.StatusOK || !strings.Contains(body, "shared") {
		t.Fatalf("spaces: %d %s", resp.StatusCode, body)
	}
	if last := e.fga.calls[len(e.fga.calls)-1]; !strings.HasSuffix(last, " alice") {
		t.Fatalf("fga saw %q", last)
	}
}

// The console takes only passes of the sign-in key issuer, each for exactly
// the audience it is given for, of one person, short, and accepted by fga.
func TestKeySignInRefusesWrongPasses(t *testing.T) {
	e, c := keyEnv(t)
	alice, carl := newSignInKey(t, e.fga, "alice"), newSignInKey(t, e.fga, "carl")
	now := c.now()
	stranger := signInKey{person: "alice", fp: alice.fp}
	_, stranger.priv, _ = ed25519.GenerateKey(rand.Reader)
	five := 5 * time.Minute
	body := func(p map[string]string) string { b, _ := json.Marshal(map[string]any{"passes": p}); return string(b) }
	for name, p := range map[string]map[string]string{
		"no storage pass":    {"fga-admin": alice.pass("fga-admin", now, five, nil)},
		"another audience":   {StorageAudience: alice.pass("fga-admin", now, five, nil)},
		"two audiences":      {StorageAudience: alice.pass(StorageAudience, now, five, func(c map[string]any) { c["aud"] = []string{StorageAudience, "fga-admin"} })},
		"a service it skips": {StorageAudience: alice.pass(StorageAudience, now, five, nil), "fga-mcp": alice.pass("fga-mcp", now, five, nil)},
		"two people":         {StorageAudience: alice.pass(StorageAudience, now, five, nil), "fga-admin": carl.pass("fga-admin", now, five, nil)},
		"another issuer":     {StorageAudience: alice.pass(StorageAudience, now, five, func(c map[string]any) { c["iss"] = "fga-dev" })},
		"too long":           {StorageAudience: alice.pass(StorageAudience, now, time.Hour, nil)},
		"about to expire":    {StorageAudience: alice.pass(StorageAudience, now, 10*time.Second, nil)},
		"a key fga does not": {StorageAudience: stranger.pass(StorageAudience, now, five, nil)},
	} {
		if resp, out := e.do(http.MethodPost, "/api/signin/keys", body(p)); resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("%s: %d %s", name, resp.StatusCode, out)
		}
		if _, s := e.do(http.MethodGet, "/api/session", ""); !strings.Contains(s, `"signed_in":false`) {
			t.Fatalf("%s signed someone in: %s", name, s)
		}
	}
	req, _ := http.NewRequest(http.MethodPost, e.console.URL+"/api/signin/keys", strings.NewReader(alice.passes(now)))
	if resp, err := e.client.Do(req); err != nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("a sign-in without the console's header: %v %d", err, resp.StatusCode)
	}
}

// A key session uses only the add-on's passes: when they run out, calls
// fail until the add-on renews them, and the console never makes a pass.
func TestKeySessionRenewsOnlyWithTheAddonsPasses(t *testing.T) {
	c := &clock{at: time.Now()}
	e := newEnvWith(t, func(cfg *Config) { cfg.KeySignIn = true }, c.now) // development sign-in stays on
	alice, carl := newSignInKey(t, e.fga, "alice"), newSignInKey(t, e.fga, "carl")
	if resp, body := e.do(http.MethodPost, "/api/signin/keys", alice.passes(c.now())); resp.StatusCode != http.StatusOK {
		t.Fatalf("key sign-in: %d %s", resp.StatusCode, body)
	}
	c.add(4*time.Minute + 45*time.Second)
	if resp, _ := e.do(http.MethodGet, "/api/spaces", ""); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("with spent passes: %d", resp.StatusCode)
	}
	if resp, _ := e.do(http.MethodPost, "/api/session/passes", carl.passes(c.now())); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("another person's passes renewed the session: %d", resp.StatusCode)
	}
	if resp, body := e.do(http.MethodPost, "/api/session/passes", alice.passes(c.now())); resp.StatusCode != http.StatusOK || !strings.Contains(body, "passes_until") {
		t.Fatalf("renewal: %d %s", resp.StatusCode, body)
	}
	if resp, _ := e.do(http.MethodGet, "/api/spaces", ""); resp.StatusCode != http.StatusOK {
		t.Fatalf("after renewal: %d", resp.StatusCode)
	}
	e.signIn("carl")
	if resp, _ := e.do(http.MethodPost, "/api/session/passes", carl.passes(c.now())); resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("a development session took key passes: %d", resp.StatusCode)
	}
}

// The person page's sign-in keys go to fga's admin API as they are, and a
// malformed fingerprint never reaches it.
func TestSignInKeysAreForwarded(t *testing.T) {
	e := newEnv(t)
	e.signIn("root")
	fp := "sha256:" + strings.Repeat("ab", 32)
	reg := `{"public_key":"AAAA","label":"Carl's laptop","limits":{"services":["fga-storage"]}}`
	for _, call := range [][2]string{{http.MethodGet, "/api/admin/people/carl/sign-in-keys"}, {http.MethodPost, "/api/admin/people/carl/sign-in-keys"},
		{http.MethodPost, "/api/admin/people/carl/sign-in-keys/" + fp + "/remove"}} {
		in := ""
		if call[1] == "/api/admin/people/carl/sign-in-keys" && call[0] == http.MethodPost {
			in = reg
		}
		if resp, body := e.do(call[0], call[1], in); resp.StatusCode != http.StatusOK {
			t.Fatalf("%s %s: %d %s", call[0], call[1], resp.StatusCode, body)
		}
	}
	if resp, _ := e.do(http.MethodPost, "/api/admin/people/carl/sign-in-keys/sha256:nothex/remove", ""); resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("a malformed fingerprint: %d", resp.StatusCode)
	}
	want := []string{"GET /v1/admin/identities/carl/sign-in-keys ", "POST /v1/admin/identities/carl/sign-in-keys " + reg,
		"POST /v1/admin/identities/carl/sign-in-keys/" + fp + "/remove "}
	var got []string
	for _, c := range e.admin.calls {
		if strings.Contains(c, "sign-in-keys") {
			got = append(got, c)
		}
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("admin API saw\n%s", strings.Join(got, "\n"))
	}
}
