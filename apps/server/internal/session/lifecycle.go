package session

import (
	"syscall"
	"time"

	"github.com/gorilla/websocket"

	"github.com/icoretech/wootty/apps/server/internal/protocol"
)

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
	m.closed = true
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
	m.mu.Unlock()

	for _, target := range targets {
		_ = writeJSON(target.conn, &target.mu, map[string]any{
			"type":   protocol.ServerMessageTypeExit,
			"code":   exitInfo.Code,
			"signal": exitInfo.Signal,
		})
	}
	m.mu.Lock()
	m.scheduleCleanupLocked(sessionID, time.Millisecond)
	m.mu.Unlock()
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

	session.cleanupGeneration++
	generation := session.cleanupGeneration
	session.reconnectTimer = time.AfterFunc(delay, func() {
		m.cleanup(sessionID, generation)
	})
}

func (m *Manager) cleanup(sessionID string, generation uint64) {
	m.mu.Lock()
	session, ok := m.sessions[sessionID]
	if !ok || session.cleanupGeneration != generation || (session.exitInfo == nil && hasConnectionsLocked(session)) {
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
