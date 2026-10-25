package session

import (
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var (
	ErrSessionAlreadyAttached = errors.New("session already attached")
	ErrSessionNotFound        = errors.New("session not found")
	ErrManagerClosed          = errors.New("session manager is closed")
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
	Name           string `json:"name,omitempty"`
}

type Manager struct {
	mu       sync.Mutex
	sessions map[string]*managedSession
	options  ManagerOptions
	closed   bool
}

type sessionConn struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

type managedSession struct {
	id                string
	process           Process
	history           *HistoryBuffer
	controller        *sessionConn
	watchers          map[*websocket.Conn]*sessionConn
	reconnectTimer    *time.Timer
	cleanupGeneration uint64
	exitInfo          *ExitInfo
	createdAt         time.Time
	lastActivity      time.Time
	command           string
	name              string
}

func NewManager(options ManagerOptions) *Manager {
	return &Manager{
		options:  options,
		sessions: make(map[string]*managedSession),
	}
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

func (m *Manager) Rename(sessionID, name string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	session, ok := m.sessions[sessionID]
	if !ok {
		return false
	}
	session.name = name
	session.lastActivity = time.Now()
	return true
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
			Name:           current.name,
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
