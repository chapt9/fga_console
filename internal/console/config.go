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
	Version      int    `json:"version"`
	Listen       string `json:"listen"`
	Tenant       string `json:"tenant"`
	Organisation string `json:"organisation"`
	// StorageURL is fga's file API (fga-storage).
	StorageURL string `json:"storage_url"`
	// Spaces names the spaces the console offers. fga's file API cannot yet
	// list the spaces a person may see, so the console asks fga about each
	// of these and shows only those fga lets the person list.
	Spaces []string `json:"spaces"`
	// DataDir holds the console's own small records (share batches).
	DataDir      string     `json:"data_dir"`
	SessionHours int        `json:"session_hours,omitempty"`
	MaxUploadMB  int64      `json:"max_upload_mb,omitempty"`
	DevSignIn    *DevSignIn `json:"dev_signin,omitempty"`
}

// DevSignIn is development sign-in: the console mints short-lived passes
// with the development issuer's key, as `fga dev-token` does. It is only
// allowed on a loopback address.
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
	abs := func(p string) string {
		if p == "" || filepath.IsAbs(p) {
			return p
		}
		return filepath.Join(dir, p)
	}
	c.DataDir = abs(c.DataDir)
	if c.DevSignIn != nil {
		c.DevSignIn.KeyFile = abs(c.DevSignIn.KeyFile)
	}
	if c.SessionHours == 0 {
		c.SessionHours = 8
	}
	if c.MaxUploadMB == 0 {
		c.MaxUploadMB = 512
	}
	return &c, c.Validate()
}

// Validate checks the configuration. Development sign-in and plain HTTP
// to fga are allowed only on loopback addresses.
func (c *Config) Validate() error {
	var errs []error
	bad := func(format string, a ...any) { errs = append(errs, fmt.Errorf(format, a...)) }
	if c.Version != 1 {
		bad("version must be 1")
	}
	host, _, err := net.SplitHostPort(c.Listen)
	if err != nil {
		bad("listen must be host:port")
	}
	if c.Tenant == "" {
		bad("tenant is required")
	}
	if c.Organisation == "" {
		c.Organisation = c.Tenant
	}
	u, err := url.Parse(c.StorageURL)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		bad("storage_url must be an http(s) URL")
	} else if u.Scheme == "http" && !loopback(u.Hostname()) {
		bad("storage_url may use plain http only on this machine (loopback)")
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
	if c.DevSignIn == nil {
		bad("dev_signin is required: sign-in with your organisation's login comes later")
	} else {
		d := c.DevSignIn
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
