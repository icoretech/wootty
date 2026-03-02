package session

import (
	"errors"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/icoretech/wootty/apps/server/internal/protocol"
)

var (
	ErrSessionAlreadyAttached = errors.New("session already attached")
	ErrSessionNotFound        = errors.New("session not found")
)

type ManagerOptions struct {
	DetachedTTL    time.Duration
	HistoryBytes   int
	FakePTY        bool
	ProcessOptions ProcessOptions
}

type AttachResult struct {
	SessionID string
	History   string
	ExitInfo  *ExitInfo
	Created   bool
	ReadOnly  bool
}

type SessionInfo struct {
	ID             string `json:"id"`
	HasController  bool   `json:"hasController"`
	CanControl     bool   `json:"canControl"`
	Watchers       int    `json:"watchers"`
	CreatedAtMs    int64  `json:"createdAtMs"`
	LastActivityMs int64  `json:"lastActivityMs"`
	Command        string `json:"command"`
}

type Manager struct {
	mu       sync.Mutex
	sessions map[string]*managedSession
	options  ManagerOptions
}

type sessionConn struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

type managedSession struct {
	id             string
	process        Process
	history        *HistoryBuffer
	controller     *sessionConn
	watchers       map[*websocket.Conn]*sessionConn
	reconnectTimer *time.Timer
	exitInfo       *ExitInfo
	createdAt      time.Time
	lastActivity   time.Time
	command        string
}

func NewManager(options ManagerOptions) *Manager {
	return &Manager{
		options:  options,
		sessions: make(map[string]*managedSession),
	}
}

func (m *Manager) Attach(sessionID string, conn *websocket.Conn, cols, rows int, watch bool) (AttachResult, error) {
	m.mu.Lock()
	if sessionID != "" {
		if existing, ok := m.sessions[sessionID]; ok {
			if existing.reconnectTimer != nil {
				existing.reconnectTimer.Stop()
				existing.reconnectTimer = nil
			}

			if watch {
				existing.watchers[conn] = &sessionConn{conn: conn}
				history := existing.history.Dump()
				exitInfo := existing.exitInfo
				existing.lastActivity = time.Now()
				m.mu.Unlock()
				return AttachResult{
					SessionID: existing.id,
					History:   history,
					ExitInfo:  exitInfo,
					Created:   false,
					ReadOnly:  true,
				}, nil
			}

			if existing.controller != nil && existing.controller.conn != conn {
				m.mu.Unlock()
				return AttachResult{}, ErrSessionAlreadyAttached
			}
			existing.controller = &sessionConn{conn: conn}
			_ = existing.process.Resize(cols, rows)
			history := existing.history.Dump()
			exitInfo := existing.exitInfo
			existing.lastActivity = time.Now()
			m.mu.Unlock()
			return AttachResult{
				SessionID: existing.id,
				History:   history,
				ExitInfo:  exitInfo,
				Created:   false,
				ReadOnly:  false,
			}, nil
		}

		if watch {
			m.mu.Unlock()
			return AttachResult{}, ErrSessionNotFound
		}

		m.mu.Unlock()
		return AttachResult{}, ErrSessionNotFound
	}

	id := uuid.NewString()
	procOptions := m.options.ProcessOptions
	procOptions.Cols = cols
	procOptions.Rows = rows
	var (
		process Process
		err     error
	)
	if m.options.FakePTY {
		process = NewFakeProcess(procOptions)
	} else {
		process, err = NewPtyProcess(procOptions)
		if err != nil {
			m.mu.Unlock()
			return AttachResult{}, err
		}
	}

	now := time.Now()
	commandLine := strings.TrimSpace(procOptions.Command + " " + strings.Join(procOptions.Args, " "))
	if commandLine == "" {
		commandLine = procOptions.Command
	}

	session := &managedSession{
		id:           id,
		process:      process,
		history:      NewHistoryBuffer(m.options.HistoryBytes),
		controller:   &sessionConn{conn: conn},
		watchers:     make(map[*websocket.Conn]*sessionConn),
		createdAt:    now,
		lastActivity: now,
		command:      commandLine,
	}

	m.sessions[id] = session
	m.mu.Unlock()

	go m.forwardOutput(id, process.Data())
	go m.watchExit(id, process.Exit())

	return AttachResult{
		SessionID: id,
		History:   "",
		ExitInfo:  nil,
		Created:   true,
		ReadOnly:  false,
	}, nil
}

func (m *Manager) Write(sessionID string, data string) bool {
	m.mu.Lock()
	session, ok := m.sessions[sessionID]
	if !ok || session.exitInfo != nil {
		m.mu.Unlock()
		return false
	}
	process := session.process
	m.mu.Unlock()

	if err := process.Write(data); err != nil {
		return false
	}

	m.mu.Lock()
	if refreshed, exists := m.sessions[sessionID]; exists {
		refreshed.lastActivity = time.Now()
	}
	m.mu.Unlock()
	return true
}

func (m *Manager) Resize(sessionID string, cols, rows int) bool {
	m.mu.Lock()
	session, ok := m.sessions[sessionID]
	if !ok || session.exitInfo != nil {
		m.mu.Unlock()
		return false
	}
	process := session.process
	m.mu.Unlock()

	if err := process.Resize(cols, rows); err != nil {
		return false
	}

	m.mu.Lock()
	if refreshed, exists := m.sessions[sessionID]; exists {
		refreshed.lastActivity = time.Now()
	}
	m.mu.Unlock()
	return true
}

func (m *Manager) Detach(sessionID string, conn *websocket.Conn) {
	m.mu.Lock()
	session, ok := m.sessions[sessionID]
	if !ok {
		m.mu.Unlock()
		return
	}

	if session.controller != nil && session.controller.conn == conn {
		session.controller = nil
	}
	delete(session.watchers, conn)

	if session.reconnectTimer != nil {
		session.reconnectTimer.Stop()
		session.reconnectTimer = nil
	}

	if session.exitInfo != nil {
		m.scheduleCleanupLocked(sessionID, time.Millisecond)
		m.mu.Unlock()
		return
	}

	// Running detached sessions are retained for DetachedTTL.
	// DetachedTTL <= 0 disables timer cleanup for running detached sessions.
	if m.options.DetachedTTL > 0 {
		m.scheduleCleanupLocked(sessionID, m.options.DetachedTTL)
	}
	m.mu.Unlock()
}

func (m *Manager) Shutdown() {
	m.mu.Lock()
	sessions := make([]*managedSession, 0, len(m.sessions))
	for _, current := range m.sessions {
		sessions = append(sessions, current)
	}
	m.sessions = make(map[string]*managedSession)
	m.mu.Unlock()

	for _, current := range sessions {
		if current.reconnectTimer != nil {
			current.reconnectTimer.Stop()
		}
		_ = current.process.Kill(syscall.SIGTERM)
		_ = current.process.Close()
		if current.controller != nil {
			_ = current.controller.conn.Close()
		}
		for _, watcher := range current.watchers {
			_ = watcher.conn.Close()
		}
	}
}

func (m *Manager) SendJSON(sessionID string, conn *websocket.Conn, payload any) error {
	m.mu.Lock()
	session, ok := m.sessions[sessionID]
	if !ok {
		m.mu.Unlock()
		return errors.New("no active connection")
	}
	target := findConnectionLocked(session, conn)
	m.mu.Unlock()
	if target == nil {
		return errors.New("no active connection")
	}
	return writeJSON(target.conn, &target.mu, payload)
}

func (m *Manager) ListSessions() []SessionInfo {
	m.mu.Lock()
	defer m.mu.Unlock()

	result := make([]SessionInfo, 0, len(m.sessions))
	for _, current := range m.sessions {
		result = append(result, SessionInfo{
			ID:             current.id,
			HasController:  current.controller != nil,
			CanControl:     current.controller == nil,
			Watchers:       len(current.watchers),
			CreatedAtMs:    current.createdAt.UnixMilli(),
			LastActivityMs: current.lastActivity.UnixMilli(),
			Command:        current.command,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		if result[i].LastActivityMs == result[j].LastActivityMs {
			return result[i].ID < result[j].ID
		}
		return result[i].LastActivityMs > result[j].LastActivityMs
	})

	return result
}

func (m *Manager) forwardOutput(sessionID string, dataCh <-chan string) {
	for data := range dataCh {
		m.mu.Lock()
		session, ok := m.sessions[sessionID]
		if !ok {
			m.mu.Unlock()
			return
		}
		session.history.Append(data)
		session.lastActivity = time.Now()
		targets := collectConnectionsLocked(session)
		m.mu.Unlock()

		for _, target := range targets {
			_ = writeJSON(target.conn, &target.mu, map[string]any{
				"type": protocol.ServerMessageTypeOutput,
				"data": data,
			})
		}
	}
}

func (m *Manager) watchExit(sessionID string, exitCh <-chan ExitInfo) {
	exitInfo, ok := <-exitCh
	if !ok {
		return
	}

	m.mu.Lock()
	session, exists := m.sessions[sessionID]
	if !exists {
		m.mu.Unlock()
		return
	}
	session.exitInfo = &exitInfo
	session.lastActivity = time.Now()
	targets := collectConnectionsLocked(session)
	m.scheduleCleanupLocked(sessionID, time.Millisecond)
	m.mu.Unlock()

	for _, target := range targets {
		_ = writeJSON(target.conn, &target.mu, map[string]any{
			"type":   protocol.ServerMessageTypeExit,
			"code":   exitInfo.Code,
			"signal": exitInfo.Signal,
		})
	}
}

func (m *Manager) scheduleCleanupLocked(sessionID string, delay time.Duration) {
	session, ok := m.sessions[sessionID]
	if !ok {
		return
	}

	if session.reconnectTimer != nil {
		session.reconnectTimer.Stop()
		session.reconnectTimer = nil
	}

	if session.exitInfo == nil && hasConnectionsLocked(session) {
		return
	}

	session.reconnectTimer = time.AfterFunc(delay, func() {
		m.cleanup(sessionID)
	})
}

func (m *Manager) cleanup(sessionID string) {
	m.mu.Lock()
	session, ok := m.sessions[sessionID]
	if !ok {
		m.mu.Unlock()
		return
	}
	delete(m.sessions, sessionID)
	m.mu.Unlock()

	if session.exitInfo == nil {
		_ = session.process.Kill(syscall.SIGTERM)
	}
	_ = session.process.Close()
	if session.controller != nil {
		_ = session.controller.conn.Close()
	}
	for _, watcher := range session.watchers {
		_ = watcher.conn.Close()
	}
}

func collectConnectionsLocked(session *managedSession) []*sessionConn {
	targets := make([]*sessionConn, 0, 1+len(session.watchers))
	if session.controller != nil {
		targets = append(targets, session.controller)
	}
	for _, watcher := range session.watchers {
		targets = append(targets, watcher)
	}
	return targets
}

func hasConnectionsLocked(session *managedSession) bool {
	return session.controller != nil || len(session.watchers) > 0
}

func findConnectionLocked(session *managedSession, conn *websocket.Conn) *sessionConn {
	if session.controller != nil && session.controller.conn == conn {
		return session.controller
	}
	if watcher, ok := session.watchers[conn]; ok {
		return watcher
	}
	return nil
}

func writeJSON(conn *websocket.Conn, mu *sync.Mutex, payload any) error {
	mu.Lock()
	defer mu.Unlock()
	return conn.WriteJSON(payload)
}
