package console

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
)

// Key sign-in (mosaic-key-store docs/sign-in.md, fga
// docs/design/sign-in-keys.md): the person's browser add-on signs short
// passes with the sign-in key from their key box, in its own window, and
// the console page hands them to this server. The server keeps them in the
// session until they expire and the add-on renews them; it never holds a
// key and makes no pass itself. fga checks every pass on every call.

// keySignInIssuer is the issuer of passes signed with a sign-in key.
const keySignInIssuer = "fga-sign-in-key"

// keyPassMargin is how long before its expiry a pass is no longer used.
const keyPassMargin = 20 * time.Second

// keyPass is one pass the add-on gave, for one audience.
type keyPass struct {
	token   string
	expires time.Time
}

// passClaims reads the claims of a pass without checking its signature:
// fga checks it on every call. The console only keeps passes of one person
// for the audience each one names, and drops them when they expire.
func passClaims(token string) (sub, iss string, aud []string, exp time.Time, err error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", "", nil, time.Time{}, errors.New("not a compact JWT")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", "", nil, time.Time{}, err
	}
	var c struct {
		Sub string          `json:"sub"`
		Iss string          `json:"iss"`
		Aud json.RawMessage `json:"aud"`
		Exp int64           `json:"exp"`
	}
	if err := json.Unmarshal(raw, &c); err != nil {
		return "", "", nil, time.Time{}, err
	}
	var one string
	if json.Unmarshal(c.Aud, &one) == nil {
		aud = []string{one}
	} else if err := json.Unmarshal(c.Aud, &aud); err != nil {
		return "", "", nil, time.Time{}, errors.New("aud")
	}
	return c.Sub, c.Iss, aud, time.Unix(c.Exp, 0), nil
}

// keyPassesFor checks the passes a page sent: one for the storage role and
// any of the console's other audiences, each of the sign-in key issuer,
// for exactly its audience, for one and the same person, not expired and
// at most a few minutes long. It answers the person and the passes.
func (s *Server) keyPassesFor(passes map[string]string) (string, map[string]keyPass, bool) {
	allowed := map[string]bool{StorageAudience: true, s.cfg.AdminAudience: true}
	if passes[StorageAudience] == "" || len(passes) > len(allowed) {
		return "", nil, false
	}
	now, person := s.now(), ""
	out := map[string]keyPass{}
	for audience, token := range passes {
		sub, iss, aud, exp, err := passClaims(token)
		switch {
		case err != nil, !allowed[audience], iss != keySignInIssuer, len(aud) != 1 || aud[0] != audience, sub == "",
			person != "" && sub != person, !exp.After(now.Add(keyPassMargin)), exp.After(now.Add(10 * time.Minute)):
			return "", nil, false
		}
		person = sub
		out[audience] = keyPass{token: token, expires: exp}
	}
	return person, out, true
}

// whoIs asks fga who a storage pass belongs to (GET /v1/me): fga verifies
// the pass, so a session never starts on a pass fga refuses.
func (s *Server) whoIs(ctx context.Context, pass string) (string, error) {
	u := *s.storage
	u.Path = strings.TrimRight(u.Path, "/") + "/v1/me"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+pass)
	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", errSignedOut
	}
	var me struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&me); err != nil || me.ID == "" {
		return "", errors.New("fga answered /v1/me without an identity")
	}
	return me.ID, nil
}

type passesBody struct {
	Passes map[string]string `json:"passes"`
}

// signInKeys starts a session from passes the add-on signed.
func (s *Server) signInKeys(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Fga-Console") != "1" || !sameOrigin(r) {
		apiError(w, http.StatusForbidden, "CROSS_SITE")
		return
	}
	var body passesBody
	if !decode(w, r, &body) {
		return
	}
	person, passes, ok := s.keyPassesFor(body.Passes)
	if !ok {
		apiError(w, http.StatusUnauthorized, "UNAUTHENTICATED")
		return
	}
	who, err := s.whoIs(r.Context(), passes[StorageAudience].token)
	if err != nil || who != person {
		if err != nil && !errors.Is(err, errSignedOut) {
			s.fgaDown(w, err)
			return
		}
		apiError(w, http.StatusUnauthorized, "UNAUTHENTICATED")
		return
	}
	ss, err := s.sessions.Start(person)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "INTERNAL")
		return
	}
	ss.setKeyPasses(passes)
	http.SetCookie(w, cookie(ss.ID, s.cfg.SessionHours*3600, s.secure()))
	s.log.Info("signed in with a key", "person", person)
	s.forgetMe(person)
	writeJSON(w, http.StatusOK, map[string]any{"person": person, "passes_until": ss.keyPassesUntil()})
}

// renewKeyPasses takes the add-on's fresh passes for the session's person.
func (s *Server) renewKeyPasses(w http.ResponseWriter, r *http.Request, person string) {
	var body passesBody
	if !decode(w, r, &body) {
		return
	}
	ss, _ := r.Context().Value(sessionKey{}).(*Session)
	who, passes, ok := s.keyPassesFor(body.Passes)
	if !ok || ss == nil || !ss.keySession() || who != person {
		apiError(w, http.StatusUnauthorized, "UNAUTHENTICATED")
		return
	}
	if me, err := s.whoIs(r.Context(), passes[StorageAudience].token); err != nil || me != person {
		apiError(w, http.StatusUnauthorized, "UNAUTHENTICATED")
		return
	}
	ss.setKeyPasses(passes)
	writeJSON(w, http.StatusOK, map[string]any{"passes_until": ss.keyPassesUntil()})
}
