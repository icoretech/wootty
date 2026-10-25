package session

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

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
	if err := conn.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
		return err
	}
	if err := conn.WriteJSON(payload); err != nil {
		_ = conn.Close()
		return err
	}
	return nil
}
