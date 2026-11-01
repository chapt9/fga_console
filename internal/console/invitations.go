package console

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"time"
)

// Invitations add a person without anyone typing the name the
// organisation's login knows them by. An administrator invites a name with
// a profile, roles and projects, and gets a one-time link. The person opens
// it and signs in at the organisation's login, and the console records the
// login's name for them. Only when an administrator confirms does the
// console create the person in fga, with the profile's rights, through
// fga's admin API and the administrator's own pass. Until then fga does not
// know them, so they can do nothing. The console keeps only a digest of
// each link's secret. Invitations need the organisation's login.

// Invitation is one invitation and how far it got.
type Invitation struct {
	ID string `json:"id"`
	// Digest is the SHA-256 of the link's secret; it never leaves the store.
	Digest    string    `json:"digest,omitempty"`
	Name      string    `json:"name"`
	Profile   string    `json:"profile"`
	Roles     []string  `json:"roles"`
	Projects  []string  `json:"projects"`
	InvitedBy string    `json:"invited_by"`
	Created   time.Time `json:"created"`
	Expires   time.Time `json:"expires"`
	// State is open, waiting (the person signed in), added or cancelled.
	State string `json:"state"`
	// Person is the name the organisation's login gave, once signed in.
	Person     string `json:"person,omitempty"`
	PersonName string `json:"person_name,omitempty"`
}

var (
	errInvitation = errors.New("no such open invitation")
	inviteWord    = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,64}$`)
)

func linkDigest(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

// AddInvitation records an invitation, and forgets invitations finished
// or expired more than 30 days ago.
func (s *Store) AddInvitation(inv Invitation, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Invitations = slices.DeleteFunc(s.Invitations, func(i Invitation) bool {
		end := i.Expires
		if i.State == "added" || i.State == "cancelled" {
			end = i.Created
		}
		return now.Sub(end) > 30*24*time.Hour
	})
	s.Invitations = append(s.Invitations, inv)
	return s.save()
}

// InvitationList returns the invitations without their digests, newest
// first.
func (s *Store) InvitationList() []Invitation {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Invitation, len(s.Invitations))
	for i, inv := range s.Invitations {
		inv.Digest = ""
		out[len(out)-1-i] = inv
	}
	return out
}

// OpenInvitation reports whether digest names an open, unexpired
// invitation.
func (s *Store) OpenInvitation(digest string, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, inv := range s.Invitations {
		if inv.Digest == digest {
			return inv.State == "open" && now.Before(inv.Expires)
		}
	}
	return false
}

// ClaimInvitation records who signed in with an open invitation's link;
// the link works once.
func (s *Store) ClaimInvitation(digest, person, name string, now time.Time) (Invitation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, inv := range s.Invitations {
		if inv.Digest == digest {
			if inv.State != "open" || !now.Before(inv.Expires) {
				return Invitation{}, errInvitation
			}
			inv.State, inv.Person, inv.PersonName = "waiting", person, name
			s.Invitations[i] = inv
			inv.Digest = ""
			return inv, s.save()
		}
	}
	return Invitation{}, errInvitation
}

// SetInvitationState moves an invitation from one of states to state.
func (s *Store) SetInvitationState(id string, states []string, state string) (Invitation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, inv := range s.Invitations {
		if inv.ID == id {
			if !slices.Contains(states, inv.State) {
				return Invitation{}, errInvitation
			}
			inv.State = state
			s.Invitations[i] = inv
			inv.Digest = ""
			return inv, s.save()
		}
	}
	return Invitation{}, errInvitation
}

// Invitation returns one invitation without its digest.
func (s *Store) Invitation(id string) (Invitation, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, inv := range s.Invitations {
		if inv.ID == id {
			inv.Digest = ""
			return inv, true
		}
	}
	return Invitation{}, false
}

// Waiting reports whether person signed in with an invitation that waits
// for an administrator.
func (s *Store) Waiting(person string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.ContainsFunc(s.Invitations, func(i Invitation) bool { return i.State == "waiting" && i.Person == person })
}

// ---------------------------------------------------------------- handlers

// invite starts the sign-in of someone who opened an invitation's link.
func (s *Server) invite(w http.ResponseWriter, r *http.Request) {
	digest := linkDigest(r.PathValue("secret"))
	if !s.store.OpenInvitation(digest, s.now()) {
		authPage(w, http.StatusGone, "This invitation was used, cancelled or has expired. Ask for a new one.")
		return
	}
	s.startLogin(w, r, digest)
}

func (s *Server) invitationRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/admin/invitations", s.authed(s.adminOnly(func(w http.ResponseWriter, r *http.Request, _ string) {
		writeJSON(w, http.StatusOK, map[string]any{"invitations": s.store.InvitationList(), "available": s.oidc != nil})
	})))
	mux.HandleFunc("POST /api/admin/invitations", s.authed(s.adminOnly(s.newInvitation)))
	mux.HandleFunc("POST /api/admin/invitations/{id}/confirm", s.authed(s.adminOnly(s.confirmInvitation)))
	mux.HandleFunc("POST /api/admin/invitations/{id}/cancel", s.authed(s.adminOnly(func(w http.ResponseWriter, r *http.Request, person string) {
		inv, err := s.store.SetInvitationState(r.PathValue("id"), []string{"open", "waiting"}, "cancelled")
		if err != nil {
			apiError(w, http.StatusNotFound, "NOT_FOUND")
			return
		}
		s.log.Info("invitation cancelled", "id", inv.ID, "by", person)
		writeJSON(w, http.StatusOK, map[string]any{"invitation": inv})
	})))
}

func (s *Server) newInvitation(w http.ResponseWriter, r *http.Request, person string) {
	if s.oidc == nil {
		apiError(w, http.StatusConflict, "INVITATIONS_NEED_LOGIN")
		return
	}
	var body struct {
		Name     string   `json:"name"`
		Profile  string   `json:"profile"`
		Roles    []string `json:"roles"`
		Projects []string `json:"projects"`
		Days     int      `json:"days"`
	}
	if !decode(w, r, &body) {
		return
	}
	known := slices.ContainsFunc(s.store.Profiles(), func(p Profile) bool { return p.ID == body.Profile })
	words := slices.Concat(body.Roles, body.Projects)
	if body.Name = strings.TrimSpace(body.Name); body.Name == "" || len(body.Name) > 80 || !known || body.Days < 1 || body.Days > 30 ||
		len(body.Roles) > 20 || len(body.Projects) > 20 || slices.ContainsFunc(words, func(v string) bool { return !inviteWord.MatchString(v) }) {
		apiError(w, http.StatusBadRequest, "INVALID_REQUEST")
		return
	}
	secret, err1 := randomID(32)
	id, err2 := randomID(12)
	if err1 != nil || err2 != nil {
		apiError(w, http.StatusInternalServerError, "INTERNAL")
		return
	}
	now := s.now()
	inv := Invitation{ID: id, Digest: linkDigest(secret), Name: body.Name, Profile: body.Profile, Roles: orEmpty(body.Roles),
		Projects: orEmpty(body.Projects), InvitedBy: person, Created: now, Expires: now.Add(time.Duration(body.Days) * 24 * time.Hour), State: "open"}
	if err := s.store.AddInvitation(inv, now); err != nil {
		apiError(w, http.StatusInternalServerError, "INTERNAL")
		return
	}
	s.log.Info("invitation made", "id", id, "by", person)
	inv.Digest = ""
	writeJSON(w, http.StatusCreated, map[string]any{"invitation": inv, "link": strings.TrimRight(s.cfg.PublicURL, "/") + "/invite/" + secret})
}

// confirmInvitation creates the invited person in fga with the
// invitation's roles, projects and profile, through fga's admin API with
// the administrator's own pass. A person fga already knows is never
// replaced.
func (s *Server) confirmInvitation(w http.ResponseWriter, r *http.Request, admin string) {
	inv, ok := s.store.Invitation(r.PathValue("id"))
	if !ok || inv.State != "waiting" {
		apiError(w, http.StatusNotFound, "NOT_FOUND")
		return
	}
	known, err := s.identityKnown(r, admin, inv.Person)
	if err != nil {
		s.fgaDown(w, err)
		return
	}
	if known {
		apiError(w, http.StatusConflict, "ALREADY_KNOWN")
		return
	}
	put, _ := json.Marshal(map[string]any{"roles": inv.Roles, "attributes": map[string]any{"projects": inv.Projects}})
	resp, err := s.callAdmin(r.Context(), admin, http.MethodPut, "/v1/admin/identities/"+url.PathEscape(inv.Person), nil, bytes.NewReader(put), int64(len(put)))
	if err != nil {
		s.fgaDown(w, err)
		return
	}
	if resp.StatusCode != http.StatusNoContent {
		relay(w, resp)
		return
	}
	resp.Body.Close()
	if inv, err = s.store.SetInvitationState(inv.ID, []string{"waiting"}, "added"); err != nil {
		apiError(w, http.StatusConflict, "CONFLICT")
		return
	}
	s.log.Info("invitation confirmed", "id", inv.ID, "person", inv.Person, "by", admin)
	out := map[string]any{"invitation": inv}
	if caps := s.profileCapabilities(inv.Profile); len(caps) > 0 {
		grant, _ := json.Marshal(map[string]any{"capabilities": caps})
		resp, err := s.callAdmin(r.Context(), admin, http.MethodPost, "/v1/admin/identities/"+url.PathEscape(inv.Person)+"/capabilities/grant",
			nil, bytes.NewReader(grant), int64(len(grant)))
		switch {
		case err != nil:
			out["rights_error"] = "UNAVAILABLE"
		case resp.StatusCode >= 300:
			var e struct {
				Error string `json:"error"`
			}
			_ = json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(&e)
			out["rights_error"] = firstOf(e.Error, "UNAVAILABLE")
		}
		if err == nil {
			resp.Body.Close()
		}
	}
	s.forgetMe(inv.Person)
	writeJSON(w, http.StatusOK, out)
}

// identityKnown asks fga's admin API, page by page, whether it knows id.
func (s *Server) identityKnown(r *http.Request, admin, id string) (bool, error) {
	after := ""
	for range 200 {
		q := url.Values{"limit": {"500"}}
		if after != "" {
			q.Set("after", after)
		}
		resp, err := s.callAdmin(r.Context(), admin, http.MethodGet, "/v1/admin/identities", q, nil, 0)
		if err != nil {
			return false, err
		}
		var page struct {
			Items []struct {
				ID string `json:"id"`
			} `json:"items"`
			Next string `json:"next"`
		}
		err = json.NewDecoder(io.LimitReader(resp.Body, 16<<20)).Decode(&page)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK || err != nil {
			return false, errFGAStatus(resp.StatusCode)
		}
		for _, item := range page.Items {
			if item.ID == id {
				return true, nil
			}
		}
		if page.Next == "" {
			return false, nil
		}
		after = page.Next
	}
	return false, errFGAStatus(http.StatusGatewayTimeout)
}

// profileCapabilities joins the capabilities of a profile's rights.
func (s *Server) profileCapabilities(profile string) map[string][]string {
	caps := map[string][]string{}
	for _, p := range s.store.Profiles() {
		if p.ID != profile {
			continue
		}
		for _, r := range Rights {
			if !slices.Contains(p.Rights, r.ID) {
				continue
			}
			for t, actions := range r.Capabilities {
				for _, a := range actions {
					if !slices.Contains(caps[t], a) {
						caps[t] = append(caps[t], a)
					}
				}
			}
		}
	}
	return caps
}

func orEmpty(v []string) []string {
	if v == nil {
		return []string{}
	}
	return v
}
