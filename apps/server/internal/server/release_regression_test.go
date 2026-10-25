package server

import (
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestTerminalRejectsRepeatedAttachWithoutLeakingController(t *testing.T) {
	s := New(testRuntimeConfig(t, true, "sh", filepath.Join(t.TempDir(), "missing")))
	defer s.Shutdown()
	h := httptest.NewServer(s.http.Handler)
	defer h.Close()
	conn := dialTerminalWebsocket(t, h.URL)
	defer conn.Close()
	attach := map[string]any{"type": "attach", "version": 1, "cols": 80, "rows": 24}
	if err := conn.WriteJSON(attach); err != nil {
		t.Fatal(err)
	}
	ready := waitForWSMessageType(t, conn, "ready", time.Second)
	if err := conn.WriteJSON(attach); err != nil {
		t.Fatal(err)
	}
	response := waitForWSMessageType(t, conn, "error", time.Second)
	if stringField(response, "code") != "attach_forbidden" {
		t.Fatalf("unexpected rejection: %#v", response)
	}
	sessions := s.sessions.ListSessions()
	if len(sessions) != 1 || sessions[0].ID != stringField(ready, "sessionId") {
		t.Fatalf("repeated attach changed sessions: %#v", sessions)
	}
}

func TestServerSupportsIPv6ListenAddress(t *testing.T) {
	cfg := testRuntimeConfig(t, true, "sh", "")
	cfg.Host = "::1"
	cfg.Port = 8080
	s := New(cfg)
	defer s.Shutdown()
	host, port, err := net.SplitHostPort(s.http.Addr)
	if err != nil || host != "::1" || port != "8080" {
		t.Fatalf("invalid IPv6 address %q: %v", s.http.Addr, err)
	}
}

func TestShutdownStopsHTTPServing(t *testing.T) {
	s := New(testRuntimeConfig(t, true, "sh", ""))
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	stopped := make(chan error, 1)
	go func() { stopped <- s.http.Serve(listener) }()
	response, err := http.Get("http://" + listener.Addr().String() + "/api/health")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	s.Shutdown()
	select {
	case err := <-stopped:
		if !errors.Is(err, http.ErrServerClosed) {
			t.Fatalf("unexpected shutdown: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("shutdown left HTTP listener running")
	}
}

func TestTerminalDeliversAllProcessOutputBeforeExit(t *testing.T) {
	cfg := testRuntimeConfig(t, false, "sh", "")
	cfg.Args = []string{"-c", "i=0; while [ $i -lt 2000 ]; do printf 'output-marker-'; i=$((i+1)); done"}
	s := New(cfg)
	defer s.Shutdown()
	h := httptest.NewServer(s.http.Handler)
	defer h.Close()
	conn := dialTerminalWebsocket(t, h.URL)
	defer conn.Close()
	if err := conn.WriteJSON(map[string]any{"type": "attach", "version": 1, "cols": 80, "rows": 24}); err != nil {
		t.Fatal(err)
	}
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	var output strings.Builder
	first := true
	for {
		var message map[string]any
		if err := conn.ReadJSON(&message); err != nil {
			t.Fatal(err)
		}
		kind := stringField(message, "type")
		if first && kind != "ready" {
			t.Fatalf("first message was %q, expected ready", kind)
		}
		first = false
		switch kind {
		case "output":
			output.WriteString(stringField(message, "data"))
		case "exit":
			if want := strings.Repeat("output-marker-", 2000); output.String() != want {
				t.Fatalf("output truncated: received %d of %d bytes", output.Len(), len(want))
			}
			return
		}
	}
}

func TestFallbackRejectsUnknownAPIRoutes(t *testing.T) {
	s := New(testRuntimeConfig(t, true, "sh", filepath.Join(t.TempDir(), "missing")))
	defer s.Shutdown()
	response := httptest.NewRecorder()
	s.http.Handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/missing", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("unknown API returned %d", response.Code)
	}
}

func TestStaticServingRejectsSymlinksOutsideRoot(t *testing.T) {
	root := t.TempDir()
	staticDir := filepath.Join(root, "static")
	if err := os.Mkdir(staticDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(staticDir, "index.html"), []byte("INDEX"), 0o600); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(root, "outside.txt")
	if err := os.WriteFile(outside, []byte("OUTSIDE"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(staticDir, "linked.txt")); err != nil {
		t.Fatal(err)
	}
	s := New(testRuntimeConfig(t, true, "sh", staticDir))
	defer s.Shutdown()
	response := httptest.NewRecorder()
	s.http.Handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/linked.txt", nil))
	if strings.Contains(response.Body.String(), "OUTSIDE") {
		t.Fatal("static route served a symlink target outside its root")
	}
}

func TestUnauthenticatedLoopbackRejectsReboundHost(t *testing.T) {
	s := New(testRuntimeConfig(t, true, "sh", ""))
	defer s.Shutdown()
	request := httptest.NewRequest(http.MethodGet, "http://untrusted.example/api/terminal", nil)
	request.Header.Set("Origin", "http://untrusted.example")
	if s.isAllowedOrigin(request) {
		t.Fatal("same-origin check accepted an unrelated hostname for an unauthenticated loopback server")
	}
}

func TestShutdownClosesUnattachedWebsocket(t *testing.T) {
	s := New(testRuntimeConfig(t, true, "sh", ""))
	h := httptest.NewServer(s.http.Handler)
	defer h.Close()
	conn := dialTerminalWebsocket(t, h.URL)
	defer conn.Close()
	s.Shutdown()
	conn.SetReadDeadline(time.Now().Add(time.Second))
	if _, _, err := conn.ReadMessage(); err == nil {
		t.Fatal("shutdown left unattached websocket open")
	} else if timeout, ok := err.(net.Error); ok && timeout.Timeout() {
		t.Fatal("websocket was not closed before read deadline")
	}
}
