package server

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
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
		DetachedTTL:    time.Duration(cfg.DetachedTTLMS) * time.Millisecond,
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
	mux.HandleFunc(protocol.SessionsHTTPRoute, s.handleSessions)
	mux.HandleFunc(protocol.TerminalWSRoute, s.handleTerminal)
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
	if !s.isAuthorizedRequest(r) {
		writeUnauthorized(w)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		protocol.SessionsEnvelopeField: s.sessions.ListSessions(),
	})
}

var baseUpgrader = websocket.Upgrader{}

func (s *Server) handleTerminal(w http.ResponseWriter, r *http.Request) {
	if !s.isAuthorizedRequest(r) {
		writeUnauthorized(w)
		return
	}
	upgrader := baseUpgrader
	upgrader.CheckOrigin = s.isAllowedOrigin
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
			payload := map[string]string{
				"type":    protocol.ServerMessageTypeError,
				"message": "Invalid message",
			}
			if errors.Is(err, protocol.ErrUnsupportedWireVersion) {
				payload["message"] = "Incompatible wire contract version"
				payload["code"] = protocol.ServerErrorCodeIncompatibleVersion
			}
			send(payload)
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
				errorCode := ""
				switch {
				case errors.Is(attachErr, session.ErrSessionNotFound):
					errorCode = protocol.ServerErrorCodeSessionNotFound
				case errors.Is(attachErr, session.ErrSessionAlreadyAttached):
					errorCode = protocol.ServerErrorCodeAttachForbidden
				}
				s.log.Error("failed to attach terminal session", "err", attachErr)
				payload := map[string]string{
					"type":    protocol.ServerMessageTypeError,
					"message": "Terminal attach failed: " + attachErr.Error(),
				}
				if errorCode != "" {
					payload["code"] = errorCode
				}
				send(payload)
				continue
			}

			activeSessionID = result.SessionID
			activeReadOnly = result.ReadOnly

			_ = s.sessions.SendJSON(activeSessionID, conn, map[string]any{
				"type":      protocol.ServerMessageTypeReady,
				"sessionId": result.SessionID,
				"readOnly":  result.ReadOnly,
				"version":   protocol.WireContractVersion,
			})

			if result.History != "" {
				_ = s.sessions.SendJSON(activeSessionID, conn, map[string]string{
					"type": protocol.ServerMessageTypeOutput,
					"data": result.History,
				})
			}
			if result.ExitInfo != nil {
				_ = s.sessions.SendJSON(activeSessionID, conn, map[string]any{
					"type":   protocol.ServerMessageTypeExit,
					"code":   result.ExitInfo.Code,
					"signal": result.ExitInfo.Signal,
				})
			}

		case protocol.InputMessage:
			if activeSessionID == "" {
				send(map[string]string{
					"type":    protocol.ServerMessageTypeError,
					"message": "Attach first",
					"code":    protocol.ServerErrorCodeAttachRequired,
				})
				continue
			}
			if activeReadOnly {
				send(map[string]string{
					"type":    protocol.ServerMessageTypeError,
					"message": "Session is read-only",
					"code":    protocol.ServerErrorCodeReadOnlyForbidden,
				})
				continue
			}
			if ok := s.sessions.Write(activeSessionID, message.Data); !ok {
				send(map[string]string{
					"type":    protocol.ServerMessageTypeError,
					"message": "Session is not writable",
					"code":    protocol.ServerErrorCodeSessionNotWritable,
				})
			}

		case protocol.ResizeMessage:
			if activeSessionID == "" {
				send(map[string]string{
					"type":    protocol.ServerMessageTypeError,
					"message": "Attach first",
					"code":    protocol.ServerErrorCodeAttachRequired,
				})
				continue
			}
			if activeReadOnly {
				send(map[string]string{
					"type":    protocol.ServerMessageTypeError,
					"message": "Session is read-only",
					"code":    protocol.ServerErrorCodeReadOnlyForbidden,
				})
				continue
			}
			if ok := s.sessions.Resize(activeSessionID, message.Cols, message.Rows); !ok {
				send(map[string]string{
					"type":    protocol.ServerMessageTypeError,
					"message": "Session is not resizable",
					"code":    protocol.ServerErrorCodeSessionNotResizable,
				})
			}

		case protocol.PingMessage:
			send(map[string]string{
				"type": protocol.ServerMessageTypePong,
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
			s.registerDirectoryRoutes(mux, staticDir)
			return
		}
	}

	if embeddedAssets, ok := webassets.EmbeddedFS(); ok {
		s.registerEmbeddedRoutes(mux, embeddedAssets)
		return
	}

	s.registerFallbackRoute(mux)
}

func (s *Server) isAuthorizedRequest(r *http.Request) bool {
	if strings.TrimSpace(s.cfg.AuthToken) == "" {
		return true
	}
	token := readAuthorizationToken(r)
	if token == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(token), []byte(s.cfg.AuthToken)) == 1
}

func (s *Server) isAllowedOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}

	if len(s.cfg.AllowedOrigins) > 0 {
		for _, allowedOrigin := range s.cfg.AllowedOrigins {
			if origin == allowedOrigin {
				return true
			}
		}
		return false
	}

	expectedHost := strings.TrimSpace(r.Host)
	if expectedHost == "" {
		return false
	}
	return origin == "http://"+expectedHost || origin == "https://"+expectedHost
}

func readAuthorizationToken(r *http.Request) string {
	authorizationHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(authorizationHeader), "bearer ") {
		token := strings.TrimSpace(authorizationHeader[len("Bearer "):])
		if token != "" {
			return token
		}
	}
	if token := strings.TrimSpace(r.Header.Get("X-Wootty-Token")); token != "" {
		return token
	}
	if cookie, err := r.Cookie("wootty_auth"); err == nil {
		if token := strings.TrimSpace(cookie.Value); token != "" {
			return token
		}
	}
	return strings.TrimSpace(r.URL.Query().Get("token"))
}

func (s *Server) registerFallbackRoute(mux *http.ServeMux) {
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if !s.authorizeStaticRequest(w, r) {
			return
		}
		setAuthCookieFromRequest(w, r)
		writeJSON(w, http.StatusOK, map[string]string{
			"service": "wootty-server",
			"message": "Web app is not built yet. Run `pnpm --filter @icoretech/wootty-web build`.",
		})
	})
}

func (s *Server) registerDirectoryRoutes(mux *http.ServeMux, staticDir string) {
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			http.NotFound(w, r)
			return
		}
		if !s.authorizeStaticRequest(w, r) {
			return
		}
		setAuthCookieFromRequest(w, r)

		if path := cleanPath(staticDir, r.URL.Path); path != "" {
			if fileInfo, statErr := os.Stat(path); statErr == nil && !fileInfo.IsDir() {
				http.ServeFile(w, r, path)
				return
			}
		}

		http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
	})
}

func (s *Server) registerEmbeddedRoutes(mux *http.ServeMux, assets fs.FS) {
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
		if !s.authorizeStaticRequest(w, r) {
			return
		}
		setAuthCookieFromRequest(w, r)

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

func writeUnauthorized(w http.ResponseWriter) {
	writeJSON(w, http.StatusUnauthorized, map[string]string{
		"error": "Unauthorized",
	})
}

func (s *Server) authorizeStaticRequest(w http.ResponseWriter, r *http.Request) bool {
	if !s.isAuthorizedRequest(r) {
		writeUnauthorized(w)
		return false
	}
	return true
}

func setAuthCookieFromRequest(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(readAuthorizationToken(r))
	if token == "" {
		return
	}
	if existingCookie, err := r.Cookie("wootty_auth"); err == nil {
		if subtle.ConstantTimeCompare([]byte(strings.TrimSpace(existingCookie.Value)), []byte(token)) == 1 {
			return
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "wootty_auth",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteLaxMode,
	})
}
