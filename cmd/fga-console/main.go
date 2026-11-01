// Command fga-console runs the fga web console: it serves the pages and
// speaks to fga's file API for each signed-in person.
//
//	fga-console -config console.json
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	fgaconsole "fga-console"
	"fga-console/internal/console"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "fga-console:", err)
		os.Exit(1)
	}
}

func run() error {
	configPath := flag.String("config", "", "the console's configuration file")
	flag.Parse()
	if *configPath == "" {
		return errors.New("usage: fga-console -config console.json")
	}
	cfg, err := console.LoadConfig(*configPath)
	if err != nil {
		return err
	}
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	web, err := fs.Sub(fgaconsole.Web, "web")
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 0, Transport: &http.Transport{ResponseHeaderTimeout: 30 * time.Second, IdleConnTimeout: 90 * time.Second}}
	srv, err := console.New(cfg, web, client, log, time.Now)
	if err != nil {
		return err
	}
	hs := &http.Server{Addr: cfg.Listen, Handler: srv.Handler(), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 2 * time.Minute}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shut, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = hs.Shutdown(shut)
	}()
	log.Info("fga console", "listen", "http://"+cfg.Listen, "organisation", cfg.Organisation, "files", cfg.StorageURL)
	if err := hs.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
