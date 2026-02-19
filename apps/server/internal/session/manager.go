package session

import (
	"errors"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type ManagerOptions struct {
	ReconnectGrace time.Duration
	HistoryBytes   int
	FakePTY        bool
	ProcessOptions ProcessOptions
}

type AttachResult struct {
	SessionID string
	History   string
	ExitInfo  *ExitInfo
	Created   bool
}

type Manager struct {
	mu       sync.Mutex
	sessions map[string]*managedSession
	options  ManagerOptions
}

type managedSession struct {
	id             string
	process        Process
	history        *HistoryBuffer
	conn           *websocket.Conn
	connMu         sync.Mutex
	reconnectTimer *time.Timer
	exitInfo       *ExitInfo
}

func NewManager(options ManagerOptions) *Manager {
	return &Manager{
		options:  options,
		sessions: make(map[string]*managedSession),
	}
}

func (m *Manager) Attach(sessionID string, conn *websocket.Conn, cols, rows int) (AttachResult, error) {
	m.mu.Lock()
	if sessionID != "" {
		if existing, ok := m.sessions[sessionID]; ok {
			if existing.reconnectTimer != nil {
				existing.reconnectTimer.Stop()
				existing.reconnectTimer = nil
			}
			if existing.conn != nil && existing.conn != conn {
				_ = existing.conn.Close()
			}
			existing.conn = conn
			_ = existing.process.Resize(cols, rows)
			history := existing.history.Dump()
			exitInfo := existing.exitInfo
			m.mu.Unlock()
			return AttachResult{
				SessionID: existing.id,
				History:   history,
				ExitInfo:  exitInfo,
				Created:   false,
			}, nil
		}
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

	session := &managedSession{
		id:      id,
		process: process,
		history: NewHistoryBuffer(m.options.HistoryBytes),
		conn:    conn,
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
	return process.Write(data) == nil
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
	return process.Resize(cols, rows) == nil
}

func (m *Manager) Detach(sessionID string, conn *websocket.Conn) {
	m.mu.Lock()
	session, ok := m.sessions[sessionID]
	if !ok {
		m.mu.Unlock()
		return
	}

	if session.conn == conn {
		session.conn = nil
	}

	delay := m.options.ReconnectGrace
	if session.exitInfo != nil {
		delay = time.Millisecond
	}
	m.scheduleCleanupLocked(sessionID, delay)
	m.mu.Unlock()
}

func (m *Manager) Shutdown() {
	m.mu.Lock()
	sessions := make([]*managedSession, 0, len(m.sessions))
	for _, session := range m.sessions {
		sessions = append(sessions, session)
	}
	m.sessions = make(map[string]*managedSession)
	m.mu.Unlock()

	for _, session := range sessions {
		if session.reconnectTimer != nil {
			session.reconnectTimer.Stop()
		}
		_ = session.process.Kill(syscall.SIGTERM)
		_ = session.process.Close()
		if session.conn != nil {
			_ = session.conn.Close()
		}
	}
}

func (m *Manager) SendJSON(sessionID string, payload any) error {
	m.mu.Lock()
	session, ok := m.sessions[sessionID]
	if !ok || session.conn == nil {
		m.mu.Unlock()
		return errors.New("no active connection")
	}
	conn := session.conn
	m.mu.Unlock()
	return writeJSON(conn, &session.connMu, payload)
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
		conn := session.conn
		m.mu.Unlock()

		if conn != nil {
			_ = writeJSON(conn, &session.connMu, map[string]any{
				"type": "output",
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
	conn := session.conn
	m.scheduleCleanupLocked(sessionID, time.Millisecond)
	m.mu.Unlock()

	if conn != nil {
		_ = writeJSON(conn, &session.connMu, map[string]any{
			"type":   "exit",
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
	if session.conn != nil {
		_ = session.conn.Close()
	}
}

func writeJSON(conn *websocket.Conn, mu *sync.Mutex, payload any) error {
	mu.Lock()
	defer mu.Unlock()
	return conn.WriteJSON(payload)
}
