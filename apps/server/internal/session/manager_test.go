package session

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestManagerAttachWriteAndExit(t *testing.T) {
	manager := NewManager(ManagerOptions{
		ReconnectGrace: 100 * time.Millisecond,
		HistoryBytes:   4096,
		FakePTY:        true,
		ProcessOptions: ProcessOptions{
			Command: "sh",
			Args:    []string{},
			Cwd:     t.TempDir(),
			Env:     map[string]string{"TERM": "xterm-256color"},
		},
	})
	defer manager.Shutdown()

	serverConn, clientConn, cleanup := newWebsocketPair(t)
	defer cleanup()

	attachResult, err := manager.Attach("", serverConn, 80, 24, false)
	if err != nil {
		t.Fatalf("attach failed: %v", err)
	}
	if !attachResult.Created {
		t.Fatal("expected created session")
	}
	if attachResult.SessionID == "" {
		t.Fatal("expected non-empty session id")
	}

	outputMessage := waitForMessageType(t, clientConn, "output", 2*time.Second)
	outputData, _ := outputMessage["data"].(string)
	if !strings.Contains(outputData, "fake terminal ready") {
		t.Fatalf("unexpected output payload: %q", outputData)
	}

	if ok := manager.Write(attachResult.SessionID, "exit\r"); !ok {
		t.Fatal("expected write to succeed")
	}

	exitMessage := waitForMessageType(t, clientConn, "exit", 2*time.Second)
	if exitMessage["type"] != "exit" {
		t.Fatalf("expected exit message, got %#v", exitMessage)
	}

	if ok := manager.Write(attachResult.SessionID, "echo after exit\r"); ok {
		t.Fatal("expected writes after exit to fail")
	}
	if ok := manager.Resize(attachResult.SessionID, 90, 30); ok {
		t.Fatal("expected resize after exit to fail")
	}
}

func TestManagerReconnectReplaysHistory(t *testing.T) {
	manager := NewManager(ManagerOptions{
		ReconnectGrace: 500 * time.Millisecond,
		HistoryBytes:   4096,
		FakePTY:        true,
		ProcessOptions: ProcessOptions{
			Command: "sh",
			Args:    []string{},
			Cwd:     t.TempDir(),
			Env:     map[string]string{"TERM": "xterm-256color"},
		},
	})
	defer manager.Shutdown()

	serverConnA, clientConnA, cleanupA := newWebsocketPair(t)
	defer cleanupA()

	firstAttach, err := manager.Attach("", serverConnA, 80, 24, false)
	if err != nil {
		t.Fatalf("first attach failed: %v", err)
	}

	_ = waitForMessageType(t, clientConnA, "output", 2*time.Second)
	if ok := manager.Write(firstAttach.SessionID, "abc\r"); !ok {
		t.Fatal("expected write to succeed")
	}
	_ = waitForOutputContaining(t, clientConnA, "a", 2*time.Second)

	manager.Detach(firstAttach.SessionID, serverConnA)

	serverConnB, _, cleanupB := newWebsocketPair(t)
	defer cleanupB()

	secondAttach, err := manager.Attach(firstAttach.SessionID, serverConnB, 120, 40, false)
	if err != nil {
		t.Fatalf("second attach failed: %v", err)
	}
	if secondAttach.Created {
		t.Fatal("expected reconnect to reuse existing session")
	}
	if secondAttach.SessionID != firstAttach.SessionID {
		t.Fatalf("expected same session id %q, got %q", firstAttach.SessionID, secondAttach.SessionID)
	}
	if !strings.Contains(secondAttach.History, "fake terminal ready") {
		t.Fatalf("expected history replay to include initial output, got %q", secondAttach.History)
	}
	if !strings.Contains(secondAttach.History, "abc") {
		t.Fatalf("expected history replay to include typed input, got %q", secondAttach.History)
	}
}

func TestManagerRejectsSecondActiveAttach(t *testing.T) {
	manager := NewManager(ManagerOptions{
		ReconnectGrace: 500 * time.Millisecond,
		HistoryBytes:   4096,
		FakePTY:        true,
		ProcessOptions: ProcessOptions{
			Command: "sh",
			Args:    []string{},
			Cwd:     t.TempDir(),
			Env:     map[string]string{"TERM": "xterm-256color"},
		},
	})
	defer manager.Shutdown()

	serverConnA, _, cleanupA := newWebsocketPair(t)
	defer cleanupA()

	firstAttach, err := manager.Attach("", serverConnA, 80, 24, false)
	if err != nil {
		t.Fatalf("first attach failed: %v", err)
	}

	serverConnB, _, cleanupB := newWebsocketPair(t)
	defer cleanupB()

	_, err = manager.Attach(firstAttach.SessionID, serverConnB, 80, 24, false)
	if !errors.Is(err, ErrSessionAlreadyAttached) {
		t.Fatalf("expected ErrSessionAlreadyAttached, got %v", err)
	}
}

func TestManagerWatchAttachIsReadOnly(t *testing.T) {
	manager := NewManager(ManagerOptions{
		ReconnectGrace: 500 * time.Millisecond,
		HistoryBytes:   4096,
		FakePTY:        true,
		ProcessOptions: ProcessOptions{
			Command: "sh",
			Args:    []string{},
			Cwd:     t.TempDir(),
			Env:     map[string]string{"TERM": "xterm-256color"},
		},
	})
	defer manager.Shutdown()

	controllerServerConn, _, cleanupController := newWebsocketPair(t)
	defer cleanupController()

	controllerAttach, err := manager.Attach("", controllerServerConn, 80, 24, false)
	if err != nil {
		t.Fatalf("controller attach failed: %v", err)
	}

	watcherServerConn, _, cleanupWatcher := newWebsocketPair(t)
	defer cleanupWatcher()

	watchAttach, err := manager.Attach(controllerAttach.SessionID, watcherServerConn, 80, 24, true)
	if err != nil {
		t.Fatalf("watch attach failed: %v", err)
	}
	if !watchAttach.ReadOnly {
		t.Fatalf("expected read-only watch attach, got %+v", watchAttach)
	}

	sessions := manager.ListSessions()
	if len(sessions) != 1 {
		t.Fatalf("expected single active session, got %#v", sessions)
	}
	if sessions[0].Watchers != 1 {
		t.Fatalf("expected one watcher, got %#v", sessions[0])
	}
}

func TestManagerReconnectGraceExpiryRemovesSession(t *testing.T) {
	manager := NewManager(ManagerOptions{
		ReconnectGrace: 30 * time.Millisecond,
		HistoryBytes:   4096,
		FakePTY:        true,
		ProcessOptions: ProcessOptions{
			Command: "sh",
			Args:    []string{},
			Cwd:     t.TempDir(),
			Env:     map[string]string{"TERM": "xterm-256color"},
		},
	})
	defer manager.Shutdown()

	serverConnA, _, cleanupA := newWebsocketPair(t)
	defer cleanupA()

	firstAttach, err := manager.Attach("", serverConnA, 80, 24, false)
	if err != nil {
		t.Fatalf("first attach failed: %v", err)
	}

	manager.Detach(firstAttach.SessionID, serverConnA)
	time.Sleep(80 * time.Millisecond)

	serverConnB, _, cleanupB := newWebsocketPair(t)
	defer cleanupB()

	_, err = manager.Attach(firstAttach.SessionID, serverConnB, 80, 24, false)
	if !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("expected ErrSessionNotFound after reconnect grace expiry, got %v", err)
	}
}

func TestManagerDetachedSessionPersistsWhenGraceDisabled(t *testing.T) {
	manager := NewManager(ManagerOptions{
		ReconnectGrace: 0,
		HistoryBytes:   4096,
		FakePTY:        true,
		ProcessOptions: ProcessOptions{
			Command: "sh",
			Args:    []string{},
			Cwd:     t.TempDir(),
			Env:     map[string]string{"TERM": "xterm-256color"},
		},
	})
	defer manager.Shutdown()

	serverConnA, _, cleanupA := newWebsocketPair(t)
	defer cleanupA()

	firstAttach, err := manager.Attach("", serverConnA, 80, 24, false)
	if err != nil {
		t.Fatalf("first attach failed: %v", err)
	}

	manager.Detach(firstAttach.SessionID, serverConnA)
	time.Sleep(80 * time.Millisecond)

	serverConnB, _, cleanupB := newWebsocketPair(t)
	defer cleanupB()

	secondAttach, err := manager.Attach(firstAttach.SessionID, serverConnB, 80, 24, false)
	if err != nil {
		t.Fatalf("second attach failed: %v", err)
	}
	if secondAttach.Created {
		t.Fatal("expected detached session to remain resumable when grace is disabled")
	}
	if secondAttach.SessionID != firstAttach.SessionID {
		t.Fatalf("expected session id %q, got %q", firstAttach.SessionID, secondAttach.SessionID)
	}
}

func TestManagerDetachedSessionExpiresWithDetachedTTL(t *testing.T) {
	manager := NewManager(ManagerOptions{
		ReconnectGrace: 0,
		DetachedTTL:    30 * time.Millisecond,
		HistoryBytes:   4096,
		FakePTY:        true,
		ProcessOptions: ProcessOptions{
			Command: "sh",
			Args:    []string{},
			Cwd:     t.TempDir(),
			Env:     map[string]string{"TERM": "xterm-256color"},
		},
	})
	defer manager.Shutdown()

	serverConnA, _, cleanupA := newWebsocketPair(t)
	defer cleanupA()

	firstAttach, err := manager.Attach("", serverConnA, 80, 24, false)
	if err != nil {
		t.Fatalf("first attach failed: %v", err)
	}

	manager.Detach(firstAttach.SessionID, serverConnA)
	time.Sleep(80 * time.Millisecond)

	serverConnB, _, cleanupB := newWebsocketPair(t)
	defer cleanupB()

	_, err = manager.Attach(firstAttach.SessionID, serverConnB, 80, 24, false)
	if !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("expected ErrSessionNotFound after detached ttl expiry, got %v", err)
	}
}

func TestManagerSendJSONAndShutdown(t *testing.T) {
	manager := NewManager(ManagerOptions{
		ReconnectGrace: 100 * time.Millisecond,
		HistoryBytes:   1024,
		FakePTY:        true,
		ProcessOptions: ProcessOptions{
			Command: "sh",
			Args:    []string{},
			Cwd:     t.TempDir(),
			Env:     map[string]string{"TERM": "xterm-256color"},
		},
	})

	serverConn, clientConn, cleanup := newWebsocketPair(t)
	defer cleanup()

	attachResult, err := manager.Attach("", serverConn, 80, 24, false)
	if err != nil {
		t.Fatalf("attach failed: %v", err)
	}

	if err := manager.SendJSON("missing-session", serverConn, map[string]string{"type": "pong"}); err == nil {
		t.Fatal("expected missing-session send to fail")
	}

	if err := manager.SendJSON(attachResult.SessionID, serverConn, map[string]string{"type": "pong"}); err != nil {
		t.Fatalf("expected send json to active session to succeed: %v", err)
	}
	_ = waitForMessageType(t, clientConn, "pong", 2*time.Second)

	if len(manager.sessions) == 0 {
		t.Fatal("expected at least one active session before shutdown")
	}
	manager.Shutdown()
	if len(manager.sessions) != 0 {
		t.Fatal("expected shutdown to clear sessions")
	}
}

func newWebsocketPair(t *testing.T) (*websocket.Conn, *websocket.Conn, func()) {
	t.Helper()

	serverConnCh := make(chan *websocket.Conn, 1)
	upgrader := websocket.Upgrader{CheckOrigin: func(_ *http.Request) bool { return true }}

	httpServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("failed to upgrade server websocket: %v", err)
			return
		}
		serverConnCh <- conn
	}))

	wsURL := "ws" + strings.TrimPrefix(httpServer.URL, "http")
	clientConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		httpServer.Close()
		t.Fatalf("failed to dial websocket test server: %v", err)
	}

	var serverConn *websocket.Conn
	select {
	case serverConn = <-serverConnCh:
	case <-time.After(2 * time.Second):
		clientConn.Close()
		httpServer.Close()
		t.Fatal("timed out waiting for upgraded server websocket")
	}

	cleanup := func() {
		_ = clientConn.Close()
		_ = serverConn.Close()
		httpServer.Close()
	}

	return serverConn, clientConn, cleanup
}

func waitForMessageType(t *testing.T, conn *websocket.Conn, messageType string, timeout time.Duration) map[string]any {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		message := readMessageMap(t, conn, time.Until(deadline))
		if message["type"] == messageType {
			return message
		}
	}

	t.Fatalf("timed out waiting for message type %q", messageType)
	return nil
}

func waitForOutputContaining(t *testing.T, conn *websocket.Conn, substring string, timeout time.Duration) map[string]any {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		message := readMessageMap(t, conn, time.Until(deadline))
		if message["type"] != "output" {
			continue
		}
		data, _ := message["data"].(string)
		if strings.Contains(data, substring) {
			return message
		}
	}

	t.Fatalf("timed out waiting for output containing %q", substring)
	return nil
}

func readMessageMap(t *testing.T, conn *websocket.Conn, timeout time.Duration) map[string]any {
	t.Helper()

	if timeout <= 0 {
		timeout = time.Second
	}
	if err := conn.SetReadDeadline(time.Now().Add(timeout)); err != nil {
		t.Fatalf("failed to set read deadline: %v", err)
	}
	_, payload, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("failed reading websocket message: %v", err)
	}

	var message map[string]any
	if err := json.Unmarshal(payload, &message); err != nil {
		t.Fatalf("failed decoding websocket message %q: %v", string(payload), err)
	}

	return message
}
