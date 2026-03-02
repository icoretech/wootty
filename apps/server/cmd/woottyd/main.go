package main

import (
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"

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
	if err := s.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		s.Shutdown()
		log.Fatalf("Failed to start WooTTY Go server: %v", err)
	}
}
