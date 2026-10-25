package server

import (
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/icoretech/wootty/apps/server/internal/config"
	"github.com/icoretech/wootty/apps/server/internal/protocol"
	"github.com/icoretech/wootty/apps/server/internal/session"
)

type Server struct {
	cfg           config.RuntimeConfig
	log           *slog.Logger
	http          *http.Server
	sessions      *session.Manager
	staticRoot    *os.Root
	connectionsMu sync.Mutex
	connections   map[*websocket.Conn]struct{}
	stopped       bool
}

const (
	readHeaderTimeout         = 5 * time.Second
	readTimeout               = 30 * time.Second
	writeTimeout              = 30 * time.Second
	idleTimeout               = 2 * time.Minute
	maxHeaderBytes            = 1 << 20
	websocketHandshakeTimeout = 10 * time.Second
	maxWebsocketMessageBytes  = 64 * 1024
)

func New(cfg config.RuntimeConfig) *Server {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	manager := session.NewManager(session.ManagerOptions{
		DetachedTTL:  time.Duration(cfg.DetachedTTLMS) * time.Millisecond,
		HistoryBytes: cfg.HistoryBytes,
		FakePTY:      cfg.FakePTY,
		ProcessOptions: session.ProcessOptions{
			Command: cfg.Command,
			Args:    cfg.Args,
			Cwd:     cfg.Cwd,
			Env:     cfg.Env,
		},
	})

	mux := http.NewServeMux()
	s := &Server{
		cfg:         cfg,
		log:         logger,
		sessions:    manager,
		connections: make(map[*websocket.Conn]struct{}),
		http: &http.Server{
			Addr:              net.JoinHostPort(strings.Trim(cfg.Host, "[]"), strconv.Itoa(cfg.Port)),
			Handler:           mux,
			ReadHeaderTimeout: readHeaderTimeout,
			ReadTimeout:       readTimeout,
			WriteTimeout:      writeTimeout,
			IdleTimeout:       idleTimeout,
			MaxHeaderBytes:    maxHeaderBytes,
		},
	}

	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/auth/bootstrap", s.handleAuthBootstrap)
	mux.HandleFunc(protocol.SessionsHTTPRoute, s.handleSessions)
	mux.HandleFunc(protocol.TerminalWSRoute, s.handleTerminal)
	s.registerStaticRoutes(mux)

	return s
}

func (s *Server) Start() error {
	s.log.Info("WooTTY Go server started",
		"host", s.cfg.Host,
		"port", s.cfg.Port,
		"command", s.cfg.Command,
	)
	return s.http.ListenAndServe()
}

func (s *Server) Shutdown() {
	if err := s.http.Close(); err != nil {
		s.log.Error("failed to close HTTP server", "err", err)
	}
	s.connectionsMu.Lock()
	s.stopped = true
	for conn := range s.connections {
		_ = conn.Close()
	}
	s.connectionsMu.Unlock()
	s.sessions.Shutdown()
	if s.staticRoot != nil {
		_ = s.staticRoot.Close()
	}
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
