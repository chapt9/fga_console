package console

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"net/http"
	"os"
	"time"
)

// NewFGAClient returns the HTTP client the console reaches fga with. With
// fga_tls it trusts only the CA fga's services chain to, and presents the
// console's own certificate, which fga's admin API checks against its
// consoles list (TLS 1.3, as fga's services require).
func NewFGAClient(t *ClientTLS) (*http.Client, error) {
	tr := &http.Transport{ResponseHeaderTimeout: 30 * time.Second, IdleConnTimeout: 90 * time.Second, ForceAttemptHTTP2: true}
	if t != nil {
		pem, err := os.ReadFile(t.CAFile)
		if err != nil {
			return nil, err
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(pem) {
			return nil, errors.New("fga_tls.ca_file holds no certificate")
		}
		cfg := &tls.Config{MinVersion: tls.VersionTLS13, RootCAs: pool}
		if t.CertFile != "" {
			cert, err := tls.LoadX509KeyPair(t.CertFile, t.KeyFile)
			if err != nil {
				return nil, err
			}
			cfg.Certificates = []tls.Certificate{cert}
		}
		tr.TLSClientConfig = cfg
	}
	return &http.Client{Transport: tr}, nil
}
