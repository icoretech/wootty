package server

import (
	"encoding/json"
	"io/fs"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"github.com/icoretech/wootty/apps/server/internal/config"
	"github.com/icoretech/wootty/apps/server/internal/protocol"
	"github.com/icoretech/wootty/apps/server/internal/session"
	"github.com/icoretech/wootty/apps/server/internal/webassets"
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
	mux.HandleFunc("/api/sessions", s.handleSessions)
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

func (s *Server) handleSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"sessions": s.sessions.ListSessions(),
	})
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
	activeReadOnly := false
	send := func(payload any) {
		if activeSessionID != "" {
			if err := s.sessions.SendJSON(activeSessionID, conn, payload); err == nil {
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
			result, attachErr := s.sessions.Attach(
				message.SessionID,
				conn,
				message.Cols,
				message.Rows,
				message.Watch,
			)
			if attachErr != nil {
				s.log.Error("failed to attach terminal session", "err", attachErr)
				send(map[string]string{
					"type":    "error",
					"message": "Terminal attach failed: " + attachErr.Error(),
				})
				continue
			}

			activeSessionID = result.SessionID
			activeReadOnly = result.ReadOnly

			_ = s.sessions.SendJSON(activeSessionID, conn, map[string]any{
				"type":      "ready",
				"sessionId": result.SessionID,
				"readOnly":  result.ReadOnly,
			})

			if result.History != "" {
				_ = s.sessions.SendJSON(activeSessionID, conn, map[string]string{
					"type": "output",
					"data": result.History,
				})
			}
			if result.ExitInfo != nil {
				_ = s.sessions.SendJSON(activeSessionID, conn, map[string]any{
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
			if activeReadOnly {
				send(map[string]string{
					"type":    "error",
					"message": "Session is read-only",
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
			if activeReadOnly {
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
	if staticDir != "" {
		info, err := os.Stat(staticDir)
		if err == nil && info.IsDir() {
			registerDirectoryRoutes(mux, staticDir)
			return
		}
	}

	if embeddedAssets, ok := webassets.EmbeddedFS(); ok {
		registerEmbeddedRoutes(mux, embeddedAssets)
		return
	}

	registerFallbackRoute(mux)
}

func registerFallbackRoute(mux *http.ServeMux) {
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"service": "wootty-server",
			"message": "Web app is not built yet. Run `pnpm --filter @icoretech/wootty-web build`.",
		})
	})
}

func registerDirectoryRoutes(mux *http.ServeMux, staticDir string) {
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

func registerEmbeddedRoutes(mux *http.ServeMux, assets fs.FS) {
	fileServer := http.FileServer(http.FS(assets))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			http.NotFound(w, r)
			return
		}

		if assetPath := cleanEmbeddedPath(r.URL.Path); assetPath != "" && embeddedAssetExists(assets, assetPath) {
			clone := cloneRequestWithPath(r, "/"+assetPath)
			fileServer.ServeHTTP(w, clone)
			return
		}

		serveEmbeddedAsset(w, assets, "index.html")
	})
}

func cleanEmbeddedPath(requestPath string) string {
	trimmed := strings.TrimPrefix(requestPath, "/")
	cleaned := path.Clean(trimmed)
	if cleaned == "." {
		return ""
	}
	if cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return ""
	}
	if strings.HasPrefix(cleaned, "/") {
		return ""
	}

	return cleaned
}

func embeddedAssetExists(assets fs.FS, assetPath string) bool {
	info, err := fs.Stat(assets, assetPath)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

func cloneRequestWithPath(request *http.Request, requestPath string) *http.Request {
	clone := request.Clone(request.Context())
	urlCopy := *request.URL
	clone.URL = &urlCopy
	clone.URL.Path = requestPath
	clone.URL.RawPath = requestPath
	return clone
}

func serveEmbeddedAsset(w http.ResponseWriter, assets fs.FS, assetPath string) {
	content, err := fs.ReadFile(assets, assetPath)
	if err != nil {
		http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
		return
	}

	if contentType := mime.TypeByExtension(path.Ext(assetPath)); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content)
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
