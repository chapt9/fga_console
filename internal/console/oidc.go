package console

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"slices"
	"strings"
	"sync"
	"time"
)

// Sign-in with the organisation's login: OpenID Connect, authorization code
// flow with PKCE, as a confidential client. The console checks the ID token
// to know who signed in, and keeps the access token, which fga checks on
// every call, on the server. It renews the access token with the refresh
// token before it expires.

// clockSkew is the leeway for token times.
const clockSkew = 30 * time.Second

type provider struct {
	cfg    *OIDC
	secret string
	client *http.Client
	now    func() time.Time

	mu       sync.Mutex
	meta     *providerMeta
	keys     map[string]jwk
	keysAt   time.Time
	pending  map[string]pendingLogin
	redirect string
}

type providerMeta struct {
	Issuer                string `json:"issuer"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	JWKSURI               string `json:"jwks_uri"`
	EndSessionEndpoint    string `json:"end_session_endpoint"`
}

type pendingLogin struct {
	nonce, verifier string
	created         time.Time
	// invite is the digest of the invitation link the sign-in started
	// from, if any.
	invite string
}

type jwk struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func newProvider(cfg *OIDC, publicURL string, client *http.Client, now func() time.Time) (*provider, error) {
	raw, err := os.ReadFile(cfg.ClientSecretFile)
	if err != nil {
		return nil, fmt.Errorf("oidc client secret: %w", err)
	}
	secret := strings.TrimSpace(string(raw))
	if secret == "" {
		return nil, errors.New("oidc client secret file is empty")
	}
	return &provider{cfg: cfg, secret: secret, client: client, now: now, pending: map[string]pendingLogin{},
		redirect: strings.TrimRight(publicURL, "/") + "/auth/callback"}, nil
}

// metadata reads the provider's discovery document once; its issuer must be
// exactly the configured one.
func (p *provider) metadata(ctx context.Context) (*providerMeta, error) {
	p.mu.Lock()
	m := p.meta
	p.mu.Unlock()
	if m != nil {
		return m, nil
	}
	var meta providerMeta
	if err := p.getJSON(ctx, strings.TrimRight(p.cfg.Issuer, "/")+"/.well-known/openid-configuration", &meta); err != nil {
		return nil, err
	}
	if meta.Issuer != p.cfg.Issuer || meta.AuthorizationEndpoint == "" || meta.TokenEndpoint == "" || meta.JWKSURI == "" {
		return nil, errors.New("oidc: the discovery document does not match the configured issuer")
	}
	p.mu.Lock()
	p.meta = &meta
	p.mu.Unlock()
	return &meta, nil
}

func (p *provider) getJSON(ctx context.Context, u string, v any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("oidc: %s answered %d", u, resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(v)
}

// key returns the provider's signing key with kid, fetching the key set at
// most once a minute for a key it does not hold.
func (p *provider) key(ctx context.Context, kid string) (jwk, error) {
	p.mu.Lock()
	k, ok := p.keys[kid]
	fresh := p.now().Sub(p.keysAt) < time.Minute
	p.mu.Unlock()
	if ok {
		return k, nil
	}
	if fresh {
		return jwk{}, fmt.Errorf("oidc: unknown key %q", kid)
	}
	m, err := p.metadata(ctx)
	if err != nil {
		return jwk{}, err
	}
	var set struct {
		Keys []jwk `json:"keys"`
	}
	if err := p.getJSON(ctx, m.JWKSURI, &set); err != nil {
		return jwk{}, err
	}
	keys := map[string]jwk{}
	for _, k := range set.Keys {
		keys[k.Kid] = k
	}
	p.mu.Lock()
	p.keys, p.keysAt = keys, p.now()
	p.mu.Unlock()
	if k, ok := keys[kid]; ok {
		return k, nil
	}
	return jwk{}, fmt.Errorf("oidc: unknown key %q", kid)
}

func b64(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(strings.TrimRight(s, "="))
}

// public turns a JWK into a key and the one algorithm it may sign with.
func (k jwk) public() (crypto.PublicKey, string, error) {
	switch {
	case k.Kty == "OKP" && k.Crv == "Ed25519":
		x, err := b64(k.X)
		if err != nil || len(x) != ed25519.PublicKeySize {
			return nil, "", errors.New("bad Ed25519 key")
		}
		return ed25519.PublicKey(x), "EdDSA", nil
	case k.Kty == "EC" && k.Crv == "P-256":
		x, err1 := b64(k.X)
		y, err2 := b64(k.Y)
		if err1 != nil || err2 != nil {
			return nil, "", errors.New("bad P-256 key")
		}
		pub := &ecdsa.PublicKey{Curve: elliptic.P256(), X: new(big.Int).SetBytes(x), Y: new(big.Int).SetBytes(y)}
		if !pub.Curve.IsOnCurve(pub.X, pub.Y) {
			return nil, "", errors.New("bad P-256 key")
		}
		return pub, "ES256", nil
	case k.Kty == "RSA":
		n, err1 := b64(k.N)
		e, err2 := b64(k.E)
		if err1 != nil || err2 != nil || len(e) > 4 {
			return nil, "", errors.New("bad RSA key")
		}
		pub := &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}
		if pub.N.BitLen() < 2048 {
			return nil, "", errors.New("RSA key below 2048 bits")
		}
		return pub, "RS256", nil
	}
	return nil, "", fmt.Errorf("unsupported key type %s %s", k.Kty, k.Crv)
}

// idClaims are the ID token claims the console reads.
type idClaims map[string]any

func (c idClaims) str(k string) string { s, _ := c[k].(string); return s }
func (c idClaims) time(k string) (time.Time, bool) {
	f, ok := c[k].(float64)
	return time.Unix(int64(f), 0), ok
}

// verifyIDToken checks an ID token's signature with the provider's key, and
// its issuer, audience, times and nonce.
func (p *provider) verifyIDToken(ctx context.Context, token, nonce string) (idClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("oidc: the ID token is not a JWT")
	}
	hb, err := b64(parts[0])
	if err != nil {
		return nil, errors.New("oidc: bad ID token header")
	}
	var h map[string]any
	if err := json.Unmarshal(hb, &h); err != nil {
		return nil, errors.New("oidc: bad ID token header")
	}
	for _, own := range []string{"jwk", "jku", "x5u", "x5c"} {
		if _, ok := h[own]; ok {
			return nil, errors.New("oidc: the ID token names its own key")
		}
	}
	kid, _ := h["kid"].(string)
	alg, _ := h["alg"].(string)
	k, err := p.key(ctx, kid)
	if err != nil {
		return nil, err
	}
	pub, want, err := k.public()
	if err != nil {
		return nil, err
	}
	if alg != want {
		return nil, fmt.Errorf("oidc: algorithm %q does not fit key %q", alg, kid)
	}
	sig, err := b64(parts[2])
	if err != nil {
		return nil, errors.New("oidc: bad signature encoding")
	}
	signing := []byte(parts[0] + "." + parts[1])
	digest := sha256.Sum256(signing)
	ok := false
	switch key := pub.(type) {
	case ed25519.PublicKey:
		ok = ed25519.Verify(key, signing, sig)
	case *ecdsa.PublicKey:
		ok = len(sig) == 64 && ecdsa.Verify(key, digest[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:]))
	case *rsa.PublicKey:
		ok = rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], sig) == nil
	}
	if !ok {
		return nil, errors.New("oidc: the ID token's signature does not verify")
	}
	cb, err := b64(parts[1])
	if err != nil {
		return nil, errors.New("oidc: bad ID token claims")
	}
	var c idClaims
	if err := json.Unmarshal(cb, &c); err != nil {
		return nil, errors.New("oidc: bad ID token claims")
	}
	now := p.now()
	exp, okExp := c.time("exp")
	iat, okIat := c.time("iat")
	var aud []string
	switch a := c["aud"].(type) {
	case string:
		aud = []string{a}
	case []any:
		for _, x := range a {
			if s, ok := x.(string); ok {
				aud = append(aud, s)
			}
		}
	}
	switch {
	case c.str("iss") != p.cfg.Issuer:
		return nil, errors.New("oidc: the ID token is from another issuer")
	case !slices.Contains(aud, p.cfg.ClientID):
		return nil, errors.New("oidc: the ID token is for another client")
	case len(aud) > 1 && c.str("azp") != p.cfg.ClientID:
		return nil, errors.New("oidc: the ID token's authorized party is another client")
	case !okExp || now.After(exp.Add(clockSkew)):
		return nil, errors.New("oidc: the ID token expired")
	case !okIat || iat.After(now.Add(clockSkew)):
		return nil, errors.New("oidc: the ID token is from the future")
	case c.str("nonce") != nonce:
		return nil, errors.New("oidc: the ID token's nonce does not match the sign-in")
	}
	return c, nil
}

// tokens are a token endpoint's answer.
type tokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	IDToken      string `json:"id_token"`
	ExpiresIn    int64  `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

func (p *provider) token(ctx context.Context, form url.Values) (tokens, error) {
	m, err := p.metadata(ctx)
	if err != nil {
		return tokens{}, err
	}
	if p.cfg.TokenAuth == "post" {
		form.Set("client_id", p.cfg.ClientID)
		form.Set("client_secret", p.secret)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return tokens{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	if p.cfg.TokenAuth == "basic" {
		req.SetBasicAuth(url.QueryEscape(p.cfg.ClientID), url.QueryEscape(p.secret))
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return tokens{}, err
	}
	defer resp.Body.Close()
	var t tokens
	if resp.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&t) != nil || t.AccessToken == "" {
		return tokens{}, fmt.Errorf("oidc: the token endpoint answered %d", resp.StatusCode)
	}
	if !strings.EqualFold(t.TokenType, "bearer") {
		return tokens{}, errors.New("oidc: the token endpoint gave no bearer token")
	}
	return t, nil
}

func pkce() (verifier, challenge string, err error) {
	verifier, err = randomID(32)
	if err != nil {
		return "", "", err
	}
	sum := sha256.Sum256([]byte(verifier))
	return verifier, base64.RawURLEncoding.EncodeToString(sum[:]), nil
}

// ---------------------------------------------------------------- handlers

func loginCookieName(secure bool) string {
	if secure {
		return "__Host-fga_console_login"
	}
	return "fga_console_login"
}

// login sends the browser to the login service. The state, nonce and PKCE
// verifier stay on the server; a short-lived cookie ties the browser to its
// own sign-in, and is sent on the provider's redirect back (SameSite Lax).
func (s *Server) login(w http.ResponseWriter, r *http.Request) { s.startLogin(w, r, "") }

// startLogin is login, remembering the invitation it started from.
func (s *Server) startLogin(w http.ResponseWriter, r *http.Request, invite string) {
	p := s.oidc
	m, err := p.metadata(r.Context())
	if err != nil {
		s.log.Error("oidc discovery", "err", err)
		authPage(w, http.StatusBadGateway, "The organisation's login can't be reached right now. Try again in a moment.")
		return
	}
	state, err1 := randomID(24)
	nonce, err2 := randomID(24)
	verifier, challenge, err3 := pkce()
	if err1 != nil || err2 != nil || err3 != nil {
		authPage(w, http.StatusInternalServerError, "Sign-in could not start.")
		return
	}
	now := s.now()
	p.mu.Lock()
	for k, v := range p.pending {
		if now.Sub(v.created) > 10*time.Minute {
			delete(p.pending, k)
		}
	}
	if len(p.pending) > 10000 {
		p.mu.Unlock()
		authPage(w, http.StatusServiceUnavailable, "Too many sign-ins at once. Try again in a moment.")
		return
	}
	p.pending[state] = pendingLogin{nonce: nonce, verifier: verifier, created: now, invite: invite}
	p.mu.Unlock()
	q := url.Values{"response_type": {"code"}, "client_id": {p.cfg.ClientID}, "redirect_uri": {p.redirect},
		"scope": {strings.Join(p.cfg.Scopes, " ")}, "state": {state}, "nonce": {nonce},
		"code_challenge": {challenge}, "code_challenge_method": {"S256"}}
	for k, v := range p.cfg.AuthParams {
		q.Set(k, v)
	}
	secure := s.secure()
	http.SetCookie(w, &http.Cookie{Name: loginCookieName(secure), Value: state, Path: "/", MaxAge: 600, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode})
	sep := "?"
	if strings.Contains(m.AuthorizationEndpoint, "?") {
		sep = "&"
	}
	http.Redirect(w, r, m.AuthorizationEndpoint+sep+q.Encode(), http.StatusFound)
}

// callback finishes a sign-in: the state must be this browser's, the code
// is exchanged with the PKCE verifier, and the ID token must verify.
func (s *Server) callback(w http.ResponseWriter, r *http.Request) {
	p, q, secure := s.oidc, r.URL.Query(), s.secure()
	http.SetCookie(w, &http.Cookie{Name: loginCookieName(secure), Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode})
	if e := q.Get("error"); e != "" {
		s.log.Info("sign-in refused by the login service", "error", e)
		authPage(w, http.StatusForbidden, "The organisation's login did not sign you in.")
		return
	}
	state := q.Get("state")
	c, err := r.Cookie(loginCookieName(secure))
	p.mu.Lock()
	pl, ok := p.pending[state]
	delete(p.pending, state)
	p.mu.Unlock()
	if err != nil || state == "" || c.Value != state || !ok || s.now().Sub(pl.created) > 10*time.Minute {
		authPage(w, http.StatusBadRequest, "This sign-in expired or did not start here. Sign in again.")
		return
	}
	t, err := p.token(r.Context(), url.Values{"grant_type": {"authorization_code"}, "code": {q.Get("code")},
		"redirect_uri": {p.redirect}, "code_verifier": {pl.verifier}})
	if err != nil {
		s.log.Warn("oidc code exchange", "err", err)
		authPage(w, http.StatusBadGateway, "The organisation's login did not finish the sign-in. Sign in again.")
		return
	}
	claims, err := p.verifyIDToken(r.Context(), t.IDToken, pl.nonce)
	if err != nil {
		s.log.Warn("oidc ID token", "err", err)
		authPage(w, http.StatusBadGateway, "The organisation's login answered with a sign-in the console cannot trust.")
		return
	}
	person := claims.str(p.cfg.PersonClaim)
	if !personID.MatchString(person) {
		authPage(w, http.StatusForbidden, "Your sign-in carries no name this console can use.")
		return
	}
	ss, err := s.sessions.Start(person)
	if err != nil {
		authPage(w, http.StatusInternalServerError, "Sign-in could not finish.")
		return
	}
	ss.Name = firstOf(claims.str("name"), claims.str("preferred_username"), person)
	ss.setTokens(t, s.now())
	http.SetCookie(w, cookie(ss.ID, s.cfg.SessionHours*3600, secure))
	s.log.Info("signed in", "person", person)
	s.forgetMe(person)
	if pl.invite != "" {
		if inv, err := s.store.ClaimInvitation(pl.invite, person, ss.Name, s.now()); err != nil {
			s.log.Info("invitation not claimed", "person", person, "err", err)
		} else {
			s.log.Info("invitation claimed", "id", inv.ID, "person", person)
		}
	}
	http.Redirect(w, r, "/", http.StatusFound)
}

func firstOf(v ...string) string {
	for _, s := range v {
		if s != "" {
			return s
		}
	}
	return ""
}

func (ss *Session) setTokens(t tokens, now time.Time) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	ss.accessToken = t.AccessToken
	if t.RefreshToken != "" {
		ss.refreshToken = t.RefreshToken
	}
	if t.IDToken != "" {
		ss.idToken = t.IDToken
	}
	life := time.Duration(t.ExpiresIn) * time.Second
	if life <= 0 {
		life = 5 * time.Minute
	}
	ss.expires = now.Add(life)
}

// errSignedOut means the session can no longer get a pass: its access token
// expired and could not be renewed.
var errSignedOut = errors.New("the sign-in ended")

// accessToken returns the session's access token, renewed with the refresh
// token when it expires within a minute.
func (s *Server) accessToken(ctx context.Context, ss *Session) (string, error) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	if ss.accessToken != "" && s.now().Add(time.Minute).Before(ss.expires) {
		return ss.accessToken, nil
	}
	if ss.refreshToken == "" {
		return "", errSignedOut
	}
	t, err := s.oidc.token(ctx, url.Values{"grant_type": {"refresh_token"}, "refresh_token": {ss.refreshToken}})
	if err != nil {
		s.log.Info("renewing a sign-in failed", "person", ss.Person, "err", err)
		return "", errSignedOut
	}
	ss.accessToken = t.AccessToken
	if t.RefreshToken != "" {
		ss.refreshToken = t.RefreshToken
	}
	life := time.Duration(t.ExpiresIn) * time.Second
	if life <= 0 {
		life = 5 * time.Minute
	}
	ss.expires = s.now().Add(life)
	return ss.accessToken, nil
}

// logoutURL is where the browser goes after signing out: the login
// service's own sign-out, when it has one.
func (s *Server) logoutURL(ctx context.Context, ss *Session) string {
	if s.oidc == nil {
		return ""
	}
	m, err := s.oidc.metadata(ctx)
	if err != nil || m.EndSessionEndpoint == "" {
		return ""
	}
	q := url.Values{"client_id": {s.oidc.cfg.ClientID}, "post_logout_redirect_uri": {strings.TrimRight(s.cfg.PublicURL, "/") + "/"}}
	if ss != nil {
		ss.mu.Lock()
		if ss.idToken != "" {
			q.Set("id_token_hint", ss.idToken)
		}
		ss.mu.Unlock()
	}
	sep := "?"
	if strings.Contains(m.EndSessionEndpoint, "?") {
		sep = "&"
	}
	return m.EndSessionEndpoint + sep + q.Encode()
}

// authPage is a small page for sign-in problems, with a way back.
func authPage(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	fmt.Fprintf(w, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`+
		`<title>fga console</title><link rel="stylesheet" href="/app.css"><div class="login"><div class="login-card"><h1>Sign in</h1>`+
		`<p class="lead">%s</p><a class="btn primary" href="/auth/login">Sign in again</a></div></div>`, html.EscapeString(msg))
}
