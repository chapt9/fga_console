package console

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"sync"
	"time"
)

// Session is one signed-in person. With the organisation's login it also
// holds the person's tokens from the login service; they stay on the
// server and never reach the browser.
type Session struct {
	ID      string
	Person  string
	Name    string
	Created time.Time
	Seen    time.Time

	mu           sync.Mutex
	accessToken  string
	refreshToken string
	expires      time.Time
	idToken      string
	// keyPasses are the passes the person's add-on signed with their
	// sign-in key, by audience (keysignin.go).
	keyPasses map[string]keyPass
}

// setKeyPasses replaces the session's passes from the add-on.
func (ss *Session) setKeyPasses(p map[string]keyPass) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	ss.keyPasses = p
}

// keySession reports whether the person signed in with a key.
func (ss *Session) keySession() bool {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	return ss.keyPasses != nil
}

// keyPass returns the pass for audience that is still valid at by.
func (ss *Session) keyPass(audience string, by time.Time) (string, bool) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	p, ok := ss.keyPasses[audience]
	if !ok || !p.expires.After(by) {
		return "", false
	}
	return p.token, true
}

// keyPassesUntil is when the first of the session's passes expires.
func (ss *Session) keyPassesUntil() time.Time {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	var first time.Time
	for _, p := range ss.keyPasses {
		if first.IsZero() || p.expires.Before(first) {
			first = p.expires
		}
	}
	return first
}

// Sessions keeps sessions in memory: a restart signs everyone out. A session
// ends after its lifetime, or after idle time without a request.
type Sessions struct {
	mu       sync.Mutex
	byID     map[string]*Session
	lifetime time.Duration
	idle     time.Duration
	now      func() time.Time
}

// NewSessions returns an empty session store.
func NewSessions(lifetime, idle time.Duration, now func() time.Time) *Sessions {
	return &Sessions{byID: map[string]*Session{}, lifetime: lifetime, idle: idle, now: now}
}

// Start begins a session for person.
func (s *Sessions) Start(person string) (*Session, error) {
	id, err := randomID(32)
	if err != nil {
		return nil, err
	}
	now := s.now()
	ss := &Session{ID: id, Person: person, Created: now, Seen: now}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sweep(now)
	s.byID[ss.ID] = ss
	return ss, nil
}

// Get returns the live session with id and marks it seen.
func (s *Sessions) Get(id string) (*Session, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ss, ok := s.byID[id]
	if !ok {
		return nil, false
	}
	now := s.now()
	if now.Sub(ss.Created) > s.lifetime || now.Sub(ss.Seen) > s.idle {
		delete(s.byID, id)
		return nil, false
	}
	ss.Seen = now
	return ss, true
}

// End ends a session.
func (s *Sessions) End(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.byID, id)
}

func (s *Sessions) sweep(now time.Time) {
	for id, ss := range s.byID {
		if now.Sub(ss.Created) > s.lifetime || now.Sub(ss.Seen) > s.idle {
			delete(s.byID, id)
		}
	}
}

func randomID(n int) (string, error) {
	raw := make([]byte, n)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// cookieName is the session cookie's name. Over HTTPS it carries the
// __Host- prefix, so the browser keeps it to this exact origin.
func cookieName(secure bool) string {
	if secure {
		return "__Host-fga_console_session"
	}
	return "fga_console_session"
}

// cookie is the session cookie: it holds only a random session ID,
// unreadable by scripts and never sent by other sites.
func cookie(value string, maxAge int, secure bool) *http.Cookie {
	return &http.Cookie{Name: cookieName(secure), Value: value, Path: "/", MaxAge: maxAge, HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode}
}
