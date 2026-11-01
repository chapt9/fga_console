package console

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"sync"
	"time"
)

// SessionCookie names the console's session cookie. It holds only a random
// session ID; passes stay on the server.
const SessionCookie = "fga_console_session"

// Session is one signed-in person.
type Session struct {
	ID      string
	Person  string
	Created time.Time
	Seen    time.Time
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
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, err
	}
	now := s.now()
	ss := &Session{ID: base64.RawURLEncoding.EncodeToString(raw), Person: person, Created: now, Seen: now}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sweep(now)
	s.byID[ss.ID] = ss
	return ss, nil
}

// Get returns the live session with id and marks it seen.
func (s *Sessions) Get(id string) (Session, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ss, ok := s.byID[id]
	if !ok {
		return Session{}, false
	}
	now := s.now()
	if now.Sub(ss.Created) > s.lifetime || now.Sub(ss.Seen) > s.idle {
		delete(s.byID, id)
		return Session{}, false
	}
	ss.Seen = now
	return *ss, true
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

// cookie is the session cookie: unreadable by scripts and never sent by
// other sites. secure is set when the console is served over HTTPS.
func cookie(value string, maxAge int, secure bool) *http.Cookie {
	return &http.Cookie{Name: SessionCookie, Value: value, Path: "/", MaxAge: maxAge, HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode}
}
