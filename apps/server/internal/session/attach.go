package session

import (
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/icoretech/wootty/apps/server/internal/protocol"
)

func (m *Manager) Attach(sessionID string, conn *websocket.Conn, cols, rows int, watch bool) (AttachResult, error) {
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return AttachResult{}, ErrManagerClosed
	}
	if sessionID != "" {
		if existing, ok := m.sessions[sessionID]; ok {
			existing.cleanupGeneration++
			if existing.reconnectTimer != nil {
				existing.reconnectTimer.Stop()
				existing.reconnectTimer = nil
			}

			if watch {
				existing.watchers[conn] = &sessionConn{conn: conn}
				history := existing.history.Dump()
				exitInfo := existing.exitInfo
				existing.lastActivity = time.Now()
				return m.finishAttachLocked(existing.watchers[conn], AttachResult{
					SessionID: existing.id,
					History:   history,
					ExitInfo:  exitInfo,
					Created:   false,
					ReadOnly:  true,
				})
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
			return m.finishAttachLocked(existing.controller, AttachResult{
				SessionID: existing.id,
				History:   history,
				ExitInfo:  exitInfo,
				Created:   false,
				ReadOnly:  false,
			})
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
	result, err := m.finishAttachLocked(session.controller, AttachResult{
		SessionID: id,
		History:   "",
		ExitInfo:  nil,
		Created:   true,
		ReadOnly:  false,
	})
	go func() {
		m.forwardOutput(id, process.Data())
		m.watchExit(id, process.Exit())
	}()
	return result, err
}

// Publish ready and replay before the connection can receive live output.
// The session lock protects the snapshot; network I/O only holds the writer lock.
func (m *Manager) finishAttachLocked(target *sessionConn, result AttachResult) (AttachResult, error) {
	target.mu.Lock()
	m.mu.Unlock()
	err := target.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if err == nil {
		err = target.conn.WriteJSON(map[string]any{
			"type":      protocol.ServerMessageTypeReady,
			"sessionId": result.SessionID,
			"readOnly":  result.ReadOnly,
			"version":   protocol.WireContractVersion,
		})
	}
	if err == nil && result.History != "" {
		err = target.conn.WriteJSON(map[string]string{"type": protocol.ServerMessageTypeOutput, "data": result.History})
	}
	if err == nil && result.ExitInfo != nil {
		err = target.conn.WriteJSON(map[string]any{"type": protocol.ServerMessageTypeExit, "code": result.ExitInfo.Code, "signal": result.ExitInfo.Signal})
	}
	target.mu.Unlock()
	if err != nil {
		_ = target.conn.Close()
		m.Detach(result.SessionID, target.conn)
	}
	return result, err
}
