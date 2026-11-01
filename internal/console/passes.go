package console

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"
)

// MaxPassLifetime is the longest pass fga accepts.
const MaxPassLifetime = time.Hour

// Minter makes development passes in fga's access-token format: a JWT of
// type at+jwt, signed with Ed25519 under the issuer's key ID, with the
// tenant in fga_tenant (fga's first-hop authentication).
type Minter struct {
	issuer, keyID, tenant string
	key                   ed25519.PrivateKey
	now                   func() time.Time
}

// NewMinter returns a Minter for one issuer key and tenant.
func NewMinter(issuer, keyID, tenant string, key ed25519.PrivateKey, now func() time.Time) *Minter {
	return &Minter{issuer: issuer, keyID: keyID, tenant: tenant, key: key, now: now}
}

// Pass returns a pass for subject, for one audience (such as fga-storage),
// valid for lifetime.
func (m *Minter) Pass(subject, audience string, lifetime time.Duration) (string, error) {
	if lifetime <= 0 || lifetime > MaxPassLifetime {
		return "", errors.New("pass lifetime must be at most an hour")
	}
	id := make([]byte, 16)
	if _, err := rand.Read(id); err != nil {
		return "", err
	}
	now := m.now()
	header, err := json.Marshal(map[string]string{"alg": "EdDSA", "kid": m.keyID, "typ": "at+jwt"})
	if err != nil {
		return "", err
	}
	claims, err := json.Marshal(map[string]any{"iss": m.issuer, "sub": subject, "aud": audience, "jti": hex.EncodeToString(id),
		"iat": now.Unix(), "nbf": now.Unix(), "exp": now.Add(lifetime).Unix(), "fga_tenant": m.tenant, "client_id": "fga-console"})
	if err != nil {
		return "", err
	}
	enc := base64.RawURLEncoding
	signing := enc.EncodeToString(header) + "." + enc.EncodeToString(claims)
	return signing + "." + enc.EncodeToString(ed25519.Sign(m.key, []byte(signing))), nil
}
