package server

import (
	"errors"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"github.com/icoretech/wootty/apps/server/internal/protocol"
	"github.com/icoretech/wootty/apps/server/internal/session"
)

var baseUpgrader = websocket.Upgrader{
	HandshakeTimeout: websocketHandshakeTimeout,
}

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
	s.connectionsMu.Lock()
	if s.stopped {
		s.connectionsMu.Unlock()
		return
	}
	s.connections[conn] = struct{}{}
	s.connectionsMu.Unlock()
	defer func() {
		s.connectionsMu.Lock()
		delete(s.connections, conn)
		s.connectionsMu.Unlock()
	}()
	conn.SetReadLimit(maxWebsocketMessageBytes)

	activeSessionID := ""
	activeReadOnly := false
	send := func(payload any) {
		if activeSessionID != "" {
			_ = s.sessions.SendJSON(activeSessionID, conn, payload)
			return
		}
		_ = conn.SetWriteDeadline(time.Now().Add(writeTimeout))
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
			if activeSessionID != "" {
				send(map[string]string{
					"type":    protocol.ServerMessageTypeError,
					"message": "Connection is already attached",
					"code":    protocol.ServerErrorCodeAttachForbidden,
				})
				continue
			}
			result, attachErr := s.sessions.Attach(
				message.SessionID,
				conn,
				message.Cols,
				message.Rows,
				message.Watch,
			)
			if attachErr != nil {
				if result.SessionID != "" {
					// Initial replay failed and the manager closed this socket.
					return
				}
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
					"code":    protocol.ServerErrorCodeSessionNotWritable,
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
					"code":    protocol.ServerErrorCodeSessionNotResizable,
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

		case protocol.RenameMessage:
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
					"code":    protocol.ServerErrorCodeSessionNotWritable,
				})
				continue
			}
			s.sessions.Rename(activeSessionID, message.Name)

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
