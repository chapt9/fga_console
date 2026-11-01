// Package console is the console server: it serves the pages, signs people
// in, keeps their sessions and passes, and turns each page action into calls
// to fga's file API with the person's own pass. fga decides every request;
// the console never judges access, never stores files and holds no file keys.
package console

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Config is the console's configuration file.
type Config struct {
	Version int `json:"version"`
	// Profile is "production" or "development" (the default). Production
	// requires HTTPS, the organisation's login and certificates to fga.
	Profile string `json:"profile,omitempty"`
	Listen  string `json:"listen"`
	// PublicURL is the address people reach the console at; sign-in
	// returns there.
	PublicURL    string     `json:"public_url,omitempty"`
	TLS          *ServerTLS `json:"tls,omitempty"`
	Tenant       string     `json:"tenant"`
	Organisation string     `json:"organisation"`
	// StorageURL is fga's file API (fga-storage).
	StorageURL string `json:"storage_url"`
	// AdminURL is fga's admin API (fga-admin serve), which decides who is
	// an administrator. Without it the console has no administrator pages.
	AdminURL      string `json:"admin_url,omitempty"`
	AdminAudience string `json:"admin_audience,omitempty"`
	// FGATLS is how the console reaches fga over HTTPS: the CA fga's
	// services chain to, and the console's own certificate, which fga's
	// admin API checks against its consoles list.
	FGATLS *ClientTLS `json:"fga_tls,omitempty"`
	// Services lists fga's services for the Servers page: their health
	// addresses, which the console checks.
	Services []Service `json:"services,omitempty"`
	// Spaces names the spaces the console offers. fga's file API cannot yet
	// list the spaces a person may see, so the console asks fga about each
	// of these and shows only those fga lets the person list.
	Spaces []string `json:"spaces"`
	// DataDir holds the console's own small records.
	DataDir      string     `json:"data_dir"`
	SessionHours int        `json:"session_hours,omitempty"`
	MaxUploadMB  int64      `json:"max_upload_mb,omitempty"`
	OIDC         *OIDC      `json:"oidc,omitempty"`
	DevSignIn    *DevSignIn `json:"dev_signin,omitempty"`
}

// ServerTLS is the console's own HTTPS certificate.
type ServerTLS struct {
	CertFile string `json:"cert_file"`
	KeyFile  string `json:"key_file"`
}

// ClientTLS is the console's side of HTTPS to fga.
type ClientTLS struct {
	CAFile   string `json:"ca_file"`
	CertFile string `json:"cert_file"`
	KeyFile  string `json:"key_file"`
}

// OIDC is sign-in with the organisation's login (OpenID Connect,
// authorization code flow with PKCE). The login service must issue access
// tokens fga accepts: its audiences include fga-storage (and fga-admin for
// administrators), with sub, jti and fga_tenant claims (see
// docs/deployment.md).
type OIDC struct {
	Issuer           string   `json:"issuer"`
	ClientID         string   `json:"client_id"`
	ClientSecretFile string   `json:"client_secret_file"`
	Scopes           []string `json:"scopes,omitempty"`
	// AuthParams are added to the sign-in request, for providers that
	// choose an access token's audience by a parameter (such as audience
	// or resource).
	AuthParams map[string]string `json:"auth_params,omitempty"`
	// TokenAuth is how the console proves itself to the token endpoint:
	// "basic" (default) or "post".
	TokenAuth string `json:"token_auth,omitempty"`
	// PersonClaim names the ID token claim that holds the person's fga
	// sign-in name (default sub); it must match the access token's sub.
	PersonClaim string `json:"person_claim,omitempty"`
}

// Service is one fga service the Servers page shows.
type Service struct {
	Name    string `json:"name"`
	Purpose string `json:"purpose"`
	Host    string `json:"host"`
	Health  string `json:"health"`
}

// DevSignIn is development sign-in: the console mints short-lived passes
// with the development issuer's key, as `fga dev-token` does. It is only
// allowed on a loopback address, and never in production.
type DevSignIn struct {
	Issuer  string   `json:"issuer"`
	KeyID   string   `json:"key_id"`
	KeyFile string   `json:"key_file"`
	People  []string `json:"people"`
}

var (
	spaceName = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{1,62}$`)
	personID  = regexp.MustCompile(`^[^\s/\x00-\x1f\x7f]{1,256}$`)
)

// LoadConfig reads and checks a configuration file. Relative paths are
// taken from the file's folder.
func LoadConfig(path string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var c Config
	if err := dec.Decode(&c); err != nil {
		return nil, fmt.Errorf("config: %w", err)
	}
	dir := filepath.Dir(path)
	abs := func(p *string) {
		if *p != "" && !filepath.IsAbs(*p) {
			*p = filepath.Join(dir, *p)
		}
	}
	abs(&c.DataDir)
	if c.DevSignIn != nil {
		abs(&c.DevSignIn.KeyFile)
	}
	if c.TLS != nil {
		abs(&c.TLS.CertFile)
		abs(&c.TLS.KeyFile)
	}
	if c.FGATLS != nil {
		abs(&c.FGATLS.CAFile)
		abs(&c.FGATLS.CertFile)
		abs(&c.FGATLS.KeyFile)
	}
	if c.OIDC != nil {
		abs(&c.OIDC.ClientSecretFile)
	}
	return &c, c.Validate()
}

func (c *Config) defaults() {
	if c.Profile == "" {
		c.Profile = "development"
	}
	if c.SessionHours == 0 {
		c.SessionHours = 8
	}
	if c.MaxUploadMB == 0 {
		c.MaxUploadMB = 512
	}
	if c.AdminAudience == "" {
		c.AdminAudience = "fga-admin"
	}
	if c.Organisation == "" {
		c.Organisation = c.Tenant
	}
	if o := c.OIDC; o != nil {
		if len(o.Scopes) == 0 {
			o.Scopes = []string{"openid", "profile"}
		}
		if o.TokenAuth == "" {
			o.TokenAuth = "basic"
		}
		if o.PersonClaim == "" {
			o.PersonClaim = "sub"
		}
	}
}

// Production reports whether the console runs in the production profile.
func (c *Config) Production() bool { return c.Profile == "production" }

// Validate checks the configuration. Production refuses plain HTTP,
// development sign-in and a missing certificate; development allows plain
// HTTP and development sign-in only on this machine (loopback).
func (c *Config) Validate() error {
	c.defaults()
	var errs []error
	bad := func(format string, a ...any) { errs = append(errs, fmt.Errorf(format, a...)) }
	prod := c.Production()
	if c.Version != 1 {
		bad("version must be 1")
	}
	if c.Profile != "production" && c.Profile != "development" {
		bad(`profile must be "production" or "development"`)
	}
	host, _, err := net.SplitHostPort(c.Listen)
	if err != nil {
		bad("listen must be host:port")
	}
	if c.Tenant == "" {
		bad("tenant is required")
	}
	// address checks one URL: https, or plain http only on this machine
	// and never in production.
	address := func(name, raw string, required bool) {
		if raw == "" {
			if required {
				bad("%s is required", name)
			}
			return
		}
		u, err := url.Parse(raw)
		switch {
		case err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "":
			bad("%s must be an http(s) URL", name)
		case u.Scheme == "http" && prod:
			bad("%s must use https in production", name)
		case u.Scheme == "http" && !loopback(u.Hostname()):
			bad("%s may use plain http only on this machine (loopback)", name)
		}
	}
	address("storage_url", c.StorageURL, true)
	address("admin_url", c.AdminURL, false)
	for _, sv := range c.Services {
		u, err := url.Parse(sv.Health)
		if sv.Name == "" || err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
			bad("services: each needs a name and an http(s) health address")
		}
	}
	if len(c.Spaces) == 0 {
		bad("spaces must name at least one space")
	}
	for _, s := range c.Spaces {
		if !spaceName.MatchString(s) {
			bad("space %q is not a valid space name", s)
		}
	}
	if c.DataDir == "" {
		bad("data_dir is required")
	}
	if c.SessionHours < 1 || c.SessionHours > 24 {
		bad("session_hours must be 1 to 24")
	}
	if c.MaxUploadMB < 1 {
		bad("max_upload_mb must be positive")
	}
	if c.TLS != nil && (c.TLS.CertFile == "" || c.TLS.KeyFile == "") {
		bad("tls needs cert_file and key_file")
	}
	if t := c.FGATLS; t != nil && (t.CAFile == "" || (t.CertFile == "") != (t.KeyFile == "")) {
		bad("fga_tls needs ca_file, and cert_file and key_file together")
	}
	if prod {
		if c.TLS == nil {
			bad("production needs tls: the console serves HTTPS")
		}
		if c.FGATLS == nil || c.FGATLS.CertFile == "" {
			bad("production needs fga_tls with the console's certificate, which fga's admin API checks")
		}
	} else if c.TLS == nil && !loopback(host) {
		bad("without tls the console may listen only on this machine (loopback)")
	}
	switch {
	case c.OIDC == nil && c.DevSignIn == nil:
		bad("name a way to sign in: oidc (the organisation's login) or dev_signin")
	case c.OIDC != nil && c.DevSignIn != nil:
		bad("use either oidc or dev_signin, not both")
	case c.DevSignIn != nil:
		d := c.DevSignIn
		if prod {
			bad("dev_signin is not allowed in production")
		}
		if !loopback(host) {
			bad("dev_signin is allowed only when listen is a loopback address")
		}
		if d.Issuer == "" || d.KeyID == "" || d.KeyFile == "" {
			bad("dev_signin needs issuer, key_id and key_file")
		}
		if len(d.People) == 0 {
			bad("dev_signin.people must name at least one person")
		}
		for _, p := range d.People {
			if !personID.MatchString(p) {
				bad("dev_signin.people: %q is not a valid sign-in name", p)
			}
		}
	default:
		o := c.OIDC
		address("oidc.issuer", o.Issuer, true)
		address("public_url", c.PublicURL, true)
		if o.ClientID == "" || o.ClientSecretFile == "" {
			bad("oidc needs client_id and client_secret_file")
		}
		if o.TokenAuth != "basic" && o.TokenAuth != "post" {
			bad(`oidc.token_auth must be "basic" or "post"`)
		}
		if !strings.Contains(" "+strings.Join(o.Scopes, " ")+" ", " openid ") {
			bad("oidc.scopes must include openid")
		}
		if u, err := url.Parse(c.PublicURL); err == nil && (u.Path != "" && u.Path != "/") {
			bad("public_url is the console's origin, without a path")
		}
	}
	return errors.Join(errs...)
}

func loopback(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// ReadIssuerKey reads a development issuer's private key: base64 Ed25519, the
// format of the fga demo's issuer.key.
func ReadIssuerKey(path string) (ed25519.PrivateKey, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(raw)))
	if err != nil || len(key) != ed25519.PrivateKeySize {
		return nil, errors.New("the issuer key file must hold a base64 Ed25519 private key")
	}
	return key, nil
}
