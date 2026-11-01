package console

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"slices"
	"sync"
	"time"
)

// What a person may use in the console comes from fga's GET /v1/me, asked
// with their own pass: fga answers their own record (principal.self read)
// or refuses. The console's right "Use the web console" is that
// capability, so fga's rules and the person's rights decide who uses the
// console's own pages. Which pages and buttons show follows the rights
// fga reports; fga still decides every request.

// meCache remembers fga's answer for a minute, as adminCache does.
type meCache struct {
	mu   sync.Mutex
	seen map[string]meEntry
}

type meEntry struct {
	rights []string // the console's rights the person holds; nil when fga refused
	at     time.Time
}

// me returns the console's rights person holds, and whether fga lets them
// use the console at all.
func (s *Server) me(ctx context.Context, person string) ([]string, bool, error) {
	s.mes.mu.Lock()
	e, ok := s.mes.seen[person]
	s.mes.mu.Unlock()
	if ok && s.now().Sub(e.at) < time.Minute {
		return e.rights, e.rights != nil, nil
	}
	pass, err := s.pass(ctx, person, StorageAudience)
	if err != nil {
		return nil, false, err
	}
	u := *s.storage
	u.Path = "/v1/me"
	u.RawPath, u.RawQuery = "", ""
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, false, err
	}
	req.Header.Set("Authorization", "Bearer "+pass)
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, false, err
	}
	defer resp.Body.Close()
	var rights []string
	switch resp.StatusCode {
	case http.StatusOK:
		var rec struct {
			Capabilities map[string][]string `json:"capabilities"`
		}
		if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&rec); err != nil {
			return nil, false, err
		}
		rights = heldRights(rec.Capabilities)
		if !slices.Contains(rights, consoleRight) {
			rights = nil
		}
	case http.StatusNotFound, http.StatusForbidden:
		// fga refused: no rule or no right lets the person read their own
		// record, so they do not use the console.
	case http.StatusUnauthorized:
		return nil, false, errSignedOut
	default:
		return nil, false, errFGAStatus(resp.StatusCode)
	}
	s.mes.mu.Lock()
	s.mes.seen[person] = meEntry{rights: rights, at: s.now()}
	s.mes.mu.Unlock()
	return rights, rights != nil, nil
}

// user admits a signed-in person whom fga lets use the console.
func (s *Server) user(fn handler) http.HandlerFunc {
	return s.authed(func(w http.ResponseWriter, r *http.Request, person string) {
		_, ok, err := s.me(r.Context(), person)
		if err != nil {
			s.fgaDown(w, err)
			return
		}
		if !ok {
			apiError(w, http.StatusForbidden, "NO_CONSOLE_ACCESS")
			return
		}
		fn(w, r, person)
	})
}

// heldRights lists the rights whose capabilities caps holds in full.
func heldRights(caps map[string][]string) []string {
	out := []string{}
	for _, r := range Rights {
		held := true
		for t, actions := range r.Capabilities {
			for _, a := range actions {
				held = held && slices.Contains(caps[t], a)
			}
		}
		if held {
			out = append(out, r.ID)
		}
	}
	return out
}

type errFGAStatus int

func (e errFGAStatus) Error() string { return "fga answered " + http.StatusText(int(e)) }
