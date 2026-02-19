package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"github.com/icoretech/wootty/apps/server/internal/config"
	"github.com/icoretech/wootty/apps/server/internal/protocol"
	"github.com/icoretech/wootty/apps/server/internal/session"
)

type Server struct {
	cfg      config.RuntimeConfig
	log      *slog.Logger
	http     *http.Server
	sessions *session.Manager
}

func New(cfg config.RuntimeConfig) *Server {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	manager := session.NewManager(session.ManagerOptions{
		ReconnectGrace: time.Duration(cfg.ReconnectGraceMS) * time.Millisecond,
		HistoryBytes:   cfg.HistoryBytes,
		FakePTY:        cfg.FakePTY,
		ProcessOptions: session.ProcessOptions{
			Command: cfg.Command,
			Args:    cfg.Args,
			Cwd:     cfg.Cwd,
			Env:     cfg.Env,
		},
	})

	mux := http.NewServeMux()
	s := &Server{
		cfg:      cfg,
		log:      logger,
		sessions: manager,
		http: &http.Server{
			Addr:    cfg.Host + ":" + strconv.Itoa(cfg.Port),
			Handler: mux,
		},
	}

	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/terminal", s.handleTerminal)
	s.registerStaticRoutes(mux)

	return s
}

func (s *Server) Start() error {
	s.log.Info("WooTTY Go server started",
		"host", s.cfg.Host,
		"port", s.cfg.Port,
		"command", strings.TrimSpace(s.cfg.Command+" "+strings.Join(s.cfg.Args, " ")),
	)
	return s.http.ListenAndServe()
}

func (s *Server) Shutdown() {
	s.sessions.Shutdown()
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(_ *http.Request) bool { return true },
}

func (s *Server) handleTerminal(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		s.log.Error("failed to upgrade websocket", "err", err)
		return
	}
	defer conn.Close()

	activeSessionID := ""
	send := func(payload any) {
		if activeSessionID != "" {
			if err := s.sessions.SendJSON(activeSessionID, payload); err == nil {
				return
			}
		}
		_ = conn.WriteJSON(payload)
	}

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}

		msg, err := protocol.ParseClientMessage(raw)
		if err != nil {
			send(map[string]string{
				"type":    "error",
				"message": "Invalid message",
			})
			continue
		}

		switch message := msg.(type) {
		case protocol.AttachMessage:
			result, attachErr := s.sessions.Attach(message.SessionID, conn, message.Cols, message.Rows)
			if attachErr != nil {
				s.log.Error("failed to attach terminal session", "err", attachErr)
				send(map[string]string{
					"type":    "error",
					"message": "Terminal attach failed: " + attachErr.Error(),
				})
				continue
			}

			activeSessionID = result.SessionID

			_ = s.sessions.SendJSON(activeSessionID, map[string]string{
				"type":      "ready",
				"sessionId": result.SessionID,
			})

			if result.History != "" {
				_ = s.sessions.SendJSON(activeSessionID, map[string]string{
					"type": "output",
					"data": result.History,
				})
			}
			if result.ExitInfo != nil {
				_ = s.sessions.SendJSON(activeSessionID, map[string]any{
					"type":   "exit",
					"code":   result.ExitInfo.Code,
					"signal": result.ExitInfo.Signal,
				})
			}

		case protocol.InputMessage:
			if activeSessionID == "" {
				send(map[string]string{
					"type":    "error",
					"message": "Attach first",
				})
				continue
			}
			if ok := s.sessions.Write(activeSessionID, message.Data); !ok {
				send(map[string]string{
					"type":    "error",
					"message": "Session is not writable",
				})
			}

		case protocol.ResizeMessage:
			if activeSessionID == "" {
				send(map[string]string{
					"type":    "error",
					"message": "Attach first",
				})
				continue
			}
			if ok := s.sessions.Resize(activeSessionID, message.Cols, message.Rows); !ok {
				send(map[string]string{
					"type":    "error",
					"message": "Session is not resizable",
				})
			}

		case protocol.PingMessage:
			send(map[string]string{
				"type": "pong",
			})
		}
	}

	if activeSessionID != "" {
		s.sessions.Detach(activeSessionID, conn)
	}
}

func (s *Server) registerStaticRoutes(mux *http.ServeMux) {
	staticDir := s.cfg.StaticDir
	if staticDir == "" {
		return
	}

	info, err := os.Stat(staticDir)
	if err != nil || !info.IsDir() {
		mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]string{
				"service": "wootty-server",
				"message": "Web app is not built yet. Run `pnpm --filter @icoretech/wootty-web build`.",
			})
		})
		return
	}

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			http.NotFound(w, r)
			return
		}

		if path := cleanPath(staticDir, r.URL.Path); path != "" {
			if fileInfo, statErr := os.Stat(path); statErr == nil && !fileInfo.IsDir() {
				http.ServeFile(w, r, path)
				return
			}
		}

		http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
	})
}

func cleanPath(baseDir string, requestPath string) string {
	trimmed := strings.TrimPrefix(requestPath, "/")
	cleaned := filepath.Clean(trimmed)
	if cleaned == "." {
		return ""
	}
	if strings.HasPrefix(cleaned, "..") || filepath.IsAbs(cleaned) {
		return ""
	}

	fullPath := filepath.Join(baseDir, cleaned)
	relativePath, err := filepath.Rel(baseDir, fullPath)
	if err != nil {
		return ""
	}
	if relativePath == ".." || strings.HasPrefix(relativePath, ".."+string(filepath.Separator)) {
		return ""
	}

	return fullPath
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
