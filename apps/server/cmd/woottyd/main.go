package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/icoretech/wootty/apps/server/internal/config"
	"github.com/icoretech/wootty/apps/server/internal/server"
)

func main() {
	cfg, err := config.ReadSystemConfig(os.Args[1:])
	if err != nil {
		if errors.Is(err, config.ErrHelpRequested) {
			_, _ = os.Stdout.WriteString(config.HelpText(filepath.Base(os.Args[0])))
			return
		}
		log.Fatalf("Failed to start WooTTY Go server: %v", err)
	}

	s := server.New(cfg)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	serveErr := make(chan error, 1)
	go func() { serveErr <- s.Start() }()
	select {
	case err = <-serveErr:
	case <-ctx.Done():
		s.Shutdown()
		err = <-serveErr
	}
	s.Shutdown()
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("Failed to start WooTTY Go server: %v", err)
	}
}
