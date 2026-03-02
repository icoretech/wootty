package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/icoretech/wootty/apps/server/internal/config"
)

func TestHealthAndFallbackRoot(t *testing.T) {
	cfg := testRuntimeConfig(t, true, "sh", filepath.Join(t.TempDir(), "missing-static"))
	server := New(cfg)
	defer server.Shutdown()

	httpServer := httptest.NewServer(server.http.Handler)
	defer httpServer.Close()

	healthResponse, err := http.Get(httpServer.URL + "/api/health")
	if err != nil {
		t.Fatalf("health request failed: %v", err)
	}
	defer healthResponse.Body.Close()

	var healthPayload map[string]any
	if err := json.NewDecoder(healthResponse.Body).Decode(&healthPayload); err != nil {
		t.Fatalf("failed decoding health payload: %v", err)
	}
	if okValue, ok := healthPayload["ok"].(bool); !ok || !okValue {
		t.Fatalf("unexpected health payload: %#v", healthPayload)
	}

	rootResponse, err := http.Get(httpServer.URL + "/")
	if err != nil {
		t.Fatalf("root request failed: %v", err)
	}
	defer rootResponse.Body.Close()

	var rootPayload map[string]any
	if err := json.NewDecoder(rootResponse.Body).Decode(&rootPayload); err != nil {
		t.Fatalf("failed decoding fallback root payload: %v", err)
	}
	if service, _ := rootPayload["service"].(string); service != "wootty-server" {
		t.Fatalf("unexpected fallback service payload: %#v", rootPayload)
	}
}

func TestStaticServingAndTraversalProtection(t *testing.T) {
	tempDir := t.TempDir()
	staticDir := filepath.Join(tempDir, "static")
	if err := os.MkdirAll(staticDir, 0o755); err != nil {
		t.Fatalf("failed creating static dir: %v", err)
	}

	indexPath := filepath.Join(staticDir, "index.html")
	assetPath := filepath.Join(staticDir, "asset.txt")
	secretPath := filepath.Join(tempDir, "secret.txt")

	if err := os.WriteFile(indexPath, []byte("INDEX"), 0o644); err != nil {
		t.Fatalf("failed writing index: %v", err)
	}
	if err := os.WriteFile(assetPath, []byte("ASSET"), 0o644); err != nil {
		t.Fatalf("failed writing asset: %v", err)
	}
	if err := os.WriteFile(secretPath, []byte("TOP-SECRET"), 0o644); err != nil {
		t.Fatalf("failed writing secret: %v", err)
	}

	cfg := testRuntimeConfig(t, true, "sh", staticDir)
	server := New(cfg)
	defer server.Shutdown()

	httpServer := httptest.NewServer(server.http.Handler)
	defer httpServer.Close()

	assetResponse, err := http.Get(httpServer.URL + "/asset.txt")
	if err != nil {
		t.Fatalf("asset request failed: %v", err)
	}
	defer assetResponse.Body.Close()
	assetBody := readBody(t, assetResponse)
	if !strings.Contains(assetBody, "ASSET") {
		t.Fatalf("expected asset response, got %q", assetBody)
	}

	routeResponse, err := http.Get(httpServer.URL + "/nested/route")
	if err != nil {
		t.Fatalf("spa fallback request failed: %v", err)
	}
	defer routeResponse.Body.Close()
	routeBody := readBody(t, routeResponse)
	if !strings.Contains(routeBody, "INDEX") {
		t.Fatalf("expected index fallback response, got %q", routeBody)
	}

	traversalResponse, err := http.Get(httpServer.URL + "/../secret.txt")
	if err != nil {
		t.Fatalf("traversal request failed: %v", err)
	}
	defer traversalResponse.Body.Close()
	traversalBody := readBody(t, traversalResponse)
	if strings.Contains(traversalBody, "TOP-SECRET") {
		t.Fatalf("path traversal leak detected: %q", traversalBody)
	}
}

func TestWebsocketProtocolFlow(t *testing.T) {
	cfg := testRuntimeConfig(t, true, "sh", filepath.Join(t.TempDir(), "missing-static"))
	server := New(cfg)
	defer server.Shutdown()

	httpServer := httptest.NewServer(server.http.Handler)
	defer httpServer.Close()

	wsConn := dialTerminalWebsocket(t, httpServer.URL)
	defer wsConn.Close()

	if err := wsConn.WriteMessage(websocket.TextMessage, []byte("invalid-json")); err != nil {
		t.Fatalf("failed writing invalid websocket payload: %v", err)
	}
	invalidMessage := waitForWSMessageType(t, wsConn, "error", 2*time.Second)
	if !strings.Contains(stringField(invalidMessage, "message"), "Invalid message") {
		t.Fatalf("expected invalid message error, got %#v", invalidMessage)
	}

	if err := wsConn.WriteJSON(map[string]any{"type": "input", "data": "ls"}); err != nil {
		t.Fatalf("failed writing input payload: %v", err)
	}
	attachFirstMessage := waitForWSMessageType(t, wsConn, "error", 2*time.Second)
	if !strings.Contains(stringField(attachFirstMessage, "message"), "Attach first") {
		t.Fatalf("expected attach first error, got %#v", attachFirstMessage)
	}
	if stringField(attachFirstMessage, "code") != "attach_required" {
		t.Fatalf("expected attach_required code, got %#v", attachFirstMessage)
	}

	if err := wsConn.WriteJSON(map[string]any{"type": "attach", "version": 1, "cols": 120, "rows": 40}); err != nil {
		t.Fatalf("failed writing attach payload: %v", err)
	}
	readyMessage := waitForWSMessageType(t, wsConn, "ready", 2*time.Second)
	if stringField(readyMessage, "sessionId") == "" {
		t.Fatalf("expected ready session id, got %#v", readyMessage)
	}

	outputMessage := waitForWSMessageType(t, wsConn, "output", 2*time.Second)
	if !strings.Contains(stringField(outputMessage, "data"), "fake terminal ready") {
		t.Fatalf("unexpected fake terminal output: %#v", outputMessage)
	}

	if err := wsConn.WriteJSON(map[string]any{"type": "ping"}); err != nil {
		t.Fatalf("failed writing ping payload: %v", err)
	}
	_ = waitForWSMessageType(t, wsConn, "pong", 2*time.Second)

	if err := wsConn.WriteJSON(map[string]any{"type": "resize", "cols": 100, "rows": 30}); err != nil {
		t.Fatalf("failed writing resize payload: %v", err)
	}

	if err := wsConn.WriteJSON(map[string]any{"type": "input", "data": "exit\r"}); err != nil {
		t.Fatalf("failed writing exit input payload: %v", err)
	}
	_ = waitForWSMessageType(t, wsConn, "exit", 2*time.Second)
}

func TestSessionsAPIListsActiveSessions(t *testing.T) {
	cfg := testRuntimeConfig(t, true, "sh", filepath.Join(t.TempDir(), "missing-static"))
	server := New(cfg)
	defer server.Shutdown()

	httpServer := httptest.NewServer(server.http.Handler)
	defer httpServer.Close()

	wsConn := dialTerminalWebsocket(t, httpServer.URL)
	defer wsConn.Close()

	if err := wsConn.WriteJSON(map[string]any{"type": "attach", "version": 1, "cols": 120, "rows": 40}); err != nil {
		t.Fatalf("failed writing attach payload: %v", err)
	}
	readyMessage := waitForWSMessageType(t, wsConn, "ready", 2*time.Second)
	sessionID := stringField(readyMessage, "sessionId")
	if sessionID == "" {
		t.Fatalf("expected ready session id, got %#v", readyMessage)
	}

	response, err := http.Get(httpServer.URL + "/api/sessions")
	if err != nil {
		t.Fatalf("sessions request failed: %v", err)
	}
	defer response.Body.Close()

	var payload struct {
		Sessions []struct {
			ID            string `json:"id"`
			HasController bool   `json:"hasController"`
			CanControl    bool   `json:"canControl"`
		} `json:"sessions"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("failed decoding sessions payload: %v", err)
	}

	if len(payload.Sessions) == 0 {
		t.Fatal("expected active sessions to be listed")
	}
	if payload.Sessions[0].ID != sessionID {
		t.Fatalf("expected session %q, got %#v", sessionID, payload.Sessions[0])
	}
	if !payload.Sessions[0].HasController {
		t.Fatalf("expected active session to report controller: %#v", payload.Sessions[0])
	}
	if payload.Sessions[0].CanControl {
		t.Fatalf("expected active session to reject control while occupied: %#v", payload.Sessions[0])
	}
}

func TestSessionsAPIRequiresTokenWhenConfigured(t *testing.T) {
	cfg := testRuntimeConfig(t, true, "sh", filepath.Join(t.TempDir(), "missing-static"))
	cfg.AuthToken = "secret-token"
	server := New(cfg)
	defer server.Shutdown()

	httpServer := httptest.NewServer(server.http.Handler)
	defer httpServer.Close()

	unauthorizedReq, err := http.NewRequest(http.MethodGet, httpServer.URL+"/api/sessions", nil)
	if err != nil {
		t.Fatalf("failed building sessions request: %v", err)
	}
	unauthorizedResp, err := http.DefaultClient.Do(unauthorizedReq)
	if err != nil {
		t.Fatalf("unauthorized sessions request failed: %v", err)
	}
	defer unauthorizedResp.Body.Close()
	if unauthorizedResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthorized sessions request, got %d", unauthorizedResp.StatusCode)
	}

	authorizedReq, err := http.NewRequest(http.MethodGet, httpServer.URL+"/api/sessions", nil)
	if err != nil {
		t.Fatalf("failed building authorized sessions request: %v", err)
	}
	authorizedReq.Header.Set("Authorization", "Bearer secret-token")
	authorizedResp, err := http.DefaultClient.Do(authorizedReq)
	if err != nil {
		t.Fatalf("authorized sessions request failed: %v", err)
	}
	defer authorizedResp.Body.Close()
	if authorizedResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for authorized sessions request, got %d", authorizedResp.StatusCode)
	}

	queryAuthorizedResp, err := http.Get(httpServer.URL + "/api/sessions?token=secret-token")
	if err != nil {
		t.Fatalf("query-auth sessions request failed: %v", err)
	}
	defer queryAuthorizedResp.Body.Close()
	if queryAuthorizedResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for query-token sessions request, got %d", queryAuthorizedResp.StatusCode)
	}

	cookieAuthorizedReq, err := http.NewRequest(http.MethodGet, httpServer.URL+"/api/sessions", nil)
	if err != nil {
		t.Fatalf("failed building cookie-authorized sessions request: %v", err)
	}
	cookieAuthorizedReq.AddCookie(&http.Cookie{
		Name:  "wootty_auth",
		Value: "secret-token",
	})
	cookieAuthorizedResp, err := http.DefaultClient.Do(cookieAuthorizedReq)
	if err != nil {
		t.Fatalf("cookie-authorized sessions request failed: %v", err)
	}
	defer cookieAuthorizedResp.Body.Close()
	if cookieAuthorizedResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for cookie-authorized sessions request, got %d", cookieAuthorizedResp.StatusCode)
	}
}

func TestStaticRoutesRequireTokenWhenConfigured(t *testing.T) {
	cfg := testRuntimeConfig(t, true, "sh", filepath.Join(t.TempDir(), "missing-static"))
	cfg.AuthToken = "secret-token"
	server := New(cfg)
	defer server.Shutdown()

	httpServer := httptest.NewServer(server.http.Handler)
	defer httpServer.Close()

	unauthorizedResponse, err := http.Get(httpServer.URL + "/")
	if err != nil {
		t.Fatalf("unauthorized static request failed: %v", err)
	}
	defer unauthorizedResponse.Body.Close()
	if unauthorizedResponse.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthorized static request, got %d", unauthorizedResponse.StatusCode)
	}

	authorizedByQuery, err := http.Get(httpServer.URL + "/?token=secret-token")
	if err != nil {
		t.Fatalf("authorized static request failed: %v", err)
	}
	defer authorizedByQuery.Body.Close()
	if authorizedByQuery.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for authorized static request, got %d", authorizedByQuery.StatusCode)
	}
	issuedCookie := authorizedByQuery.Cookies()
	if len(issuedCookie) == 0 || issuedCookie[0].Name != "wootty_auth" {
		t.Fatalf("expected auth cookie to be issued from request token, got %#v", issuedCookie)
	}
	if issuedCookie[0].Value != "secret-token" {
		t.Fatalf("expected auth cookie to mirror provided token, got %q", issuedCookie[0].Value)
	}
}

func TestTerminalWebsocketRequiresTokenWhenConfigured(t *testing.T) {
	cfg := testRuntimeConfig(t, true, "sh", filepath.Join(t.TempDir(), "missing-static"))
	cfg.AuthToken = "secret-token"
	server := New(cfg)
	defer server.Shutdown()

	httpServer := httptest.NewServer(server.http.Handler)
	defer httpServer.Close()

	unauthorizedConn, unauthorizedResponse, err := websocket.DefaultDialer.Dial(
		websocketURL(httpServer.URL),
		nil,
	)
	if unauthorizedConn != nil {
		unauthorizedConn.Close()
	}
	if err == nil {
		t.Fatal("expected websocket dial to fail without auth token")
	}
	if unauthorizedResponse == nil || unauthorizedResponse.StatusCode != http.StatusUnauthorized {
		t.Fatalf(
			"expected 401 for unauthorized websocket upgrade, got response=%#v err=%v",
			unauthorizedResponse,
			err,
		)
	}

	authorizedConn, _, err := websocket.DefaultDialer.Dial(
		websocketURL(httpServer.URL)+"?token=secret-token",
		nil,
	)
	if err != nil {
		t.Fatalf("failed to dial terminal websocket with query token: %v", err)
	}
	defer authorizedConn.Close()

	if err := authorizedConn.WriteJSON(map[string]any{
		"type":    "attach",
		"version": 1,
		"cols":    80,
		"rows":    24,
	}); err != nil {
		t.Fatalf("failed writing attach payload with auth token: %v", err)
	}
	_ = waitForWSMessageType(t, authorizedConn, "ready", 2*time.Second)

	headerAuthorizedConn, headerAuthorizedResponse, err := websocket.DefaultDialer.Dial(
		websocketURL(httpServer.URL),
		http.Header{"Authorization": []string{"Bearer secret-token"}},
	)
	if headerAuthorizedConn != nil {
		headerAuthorizedConn.Close()
	}
	if err == nil {
		t.Fatal("expected websocket dial with Authorization header to fail")
	}
	if headerAuthorizedResponse == nil || headerAuthorizedResponse.StatusCode != http.StatusUnauthorized {
		t.Fatalf(
			"expected 401 for websocket upgrade using Authorization header, got response=%#v err=%v",
			headerAuthorizedResponse,
			err,
		)
	}

	cookieAuthorizedConn, _, err := websocket.DefaultDialer.Dial(
		websocketURL(httpServer.URL),
		http.Header{"Cookie": []string{"wootty_auth=secret-token"}},
	)
	if err != nil {
		t.Fatalf("failed to dial terminal websocket with auth cookie: %v", err)
	}
	defer cookieAuthorizedConn.Close()
	if err := cookieAuthorizedConn.WriteJSON(map[string]any{
		"type":    "attach",
		"version": 1,
		"cols":    80,
		"rows":    24,
	}); err != nil {
		t.Fatalf("failed writing attach payload with auth cookie: %v", err)
	}
	_ = waitForWSMessageType(t, cookieAuthorizedConn, "ready", 2*time.Second)
}

func TestTerminalWebsocketRejectsDisallowedOrigin(t *testing.T) {
	cfg := testRuntimeConfig(t, true, "sh", filepath.Join(t.TempDir(), "missing-static"))
	cfg.AllowedOrigins = []string{"https://allowed.example"}
	server := New(cfg)
	defer server.Shutdown()

	httpServer := httptest.NewServer(server.http.Handler)
	defer httpServer.Close()

	disallowedConn, disallowedResponse, err := websocket.DefaultDialer.Dial(
		websocketURL(httpServer.URL),
		http.Header{"Origin": []string{"https://blocked.example"}},
	)
	if disallowedConn != nil {
		disallowedConn.Close()
	}
	if err == nil {
		t.Fatal("expected websocket dial to fail for disallowed origin")
	}
	if disallowedResponse == nil || disallowedResponse.StatusCode != http.StatusForbidden {
		t.Fatalf(
			"expected 403 for disallowed origin websocket upgrade, got response=%#v err=%v",
			disallowedResponse,
			err,
		)
	}

	allowedConn := dialTerminalWebsocketWithHeaders(t, httpServer.URL, http.Header{
		"Origin": []string{"https://allowed.example"},
	})
	defer allowedConn.Close()

	if err := allowedConn.WriteJSON(map[string]any{
		"type":    "attach",
		"version": 1,
		"cols":    80,
		"rows":    24,
	}); err != nil {
		t.Fatalf("failed writing attach payload for allowed origin: %v", err)
	}
	_ = waitForWSMessageType(t, allowedConn, "ready", 2*time.Second)
}

func TestWatchModeIsReadOnly(t *testing.T) {
	cfg := testRuntimeConfig(t, true, "sh", filepath.Join(t.TempDir(), "missing-static"))
	server := New(cfg)
	defer server.Shutdown()

	httpServer := httptest.NewServer(server.http.Handler)
	defer httpServer.Close()

	controllerConn := dialTerminalWebsocket(t, httpServer.URL)
	defer controllerConn.Close()

	if err := controllerConn.WriteJSON(map[string]any{"type": "attach", "version": 1, "cols": 80, "rows": 24}); err != nil {
		t.Fatalf("failed writing controller attach payload: %v", err)
	}
	controllerReady := waitForWSMessageType(t, controllerConn, "ready", 2*time.Second)
	sessionID := stringField(controllerReady, "sessionId")
	if sessionID == "" {
		t.Fatalf("expected session id in controller ready payload: %#v", controllerReady)
	}

	watchConn := dialTerminalWebsocket(t, httpServer.URL)
	defer watchConn.Close()

	if err := watchConn.WriteJSON(map[string]any{
		"type":      "attach",
		"version":   1,
		"sessionId": sessionID,
		"cols":      80,
		"rows":      24,
		"watch":     true,
	}); err != nil {
		t.Fatalf("failed writing watch attach payload: %v", err)
	}

	watchReady := waitForWSMessageType(t, watchConn, "ready", 2*time.Second)
	readOnly, ok := watchReady["readOnly"].(bool)
	if !ok || !readOnly {
		t.Fatalf("expected read-only ready payload, got %#v", watchReady)
	}

	if err := watchConn.WriteJSON(map[string]any{"type": "input", "data": "whoami\r"}); err != nil {
		t.Fatalf("failed writing watch input payload: %v", err)
	}
	errMessage := waitForWSMessageType(t, watchConn, "error", 2*time.Second)
	if !strings.Contains(stringField(errMessage, "message"), "read-only") {
		t.Fatalf("expected read-only error payload, got %#v", errMessage)
	}
	if stringField(errMessage, "code") != "session_not_writable" {
		t.Fatalf("expected session_not_writable code for watch input, got %#v", errMessage)
	}

	if err := watchConn.WriteJSON(map[string]any{"type": "resize", "cols": 120, "rows": 40}); err != nil {
		t.Fatalf("failed writing watch resize payload: %v", err)
	}
	resizeErrorMessage := waitForWSMessageType(t, watchConn, "error", 2*time.Second)
	if !strings.Contains(stringField(resizeErrorMessage, "message"), "read-only") {
		t.Fatalf("expected read-only resize error payload, got %#v", resizeErrorMessage)
	}
	if stringField(resizeErrorMessage, "code") != "session_not_resizable" {
		t.Fatalf("expected session_not_resizable code for watch resize, got %#v", resizeErrorMessage)
	}
}

func TestAttachMissingSessionReturnsSessionNotFoundCode(t *testing.T) {
	cfg := testRuntimeConfig(t, true, "sh", filepath.Join(t.TempDir(), "missing-static"))
	cfg.DetachedTTLMS = 100
	server := New(cfg)
	defer server.Shutdown()

	httpServer := httptest.NewServer(server.http.Handler)
	defer httpServer.Close()

	wsConnA := dialTerminalWebsocket(t, httpServer.URL)
	if err := wsConnA.WriteJSON(map[string]any{"type": "attach", "version": 1, "cols": 80, "rows": 24}); err != nil {
		t.Fatalf("failed writing initial attach payload: %v", err)
	}
	readyMessage := waitForWSMessageType(t, wsConnA, "ready", 2*time.Second)
	sessionID := stringField(readyMessage, "sessionId")
	if sessionID == "" {
		t.Fatalf("expected session id in ready payload, got %#v", readyMessage)
	}
	wsConnA.Close()

	time.Sleep(150 * time.Millisecond)

	wsConnB := dialTerminalWebsocket(t, httpServer.URL)
	defer wsConnB.Close()
	if err := wsConnB.WriteJSON(map[string]any{
		"type":      "attach",
		"version":   1,
		"sessionId": sessionID,
		"cols":      80,
		"rows":      24,
	}); err != nil {
		t.Fatalf("failed writing stale attach payload: %v", err)
	}

	errorMessage := waitForWSMessageType(t, wsConnB, "error", 2*time.Second)
	if stringField(errorMessage, "code") != "session_not_found" {
		t.Fatalf("expected session_not_found code, got %#v", errorMessage)
	}
}

func TestWebsocketAttachFailureSurfacesError(t *testing.T) {
	cfg := testRuntimeConfig(t, false, "/definitely/missing-command", filepath.Join(t.TempDir(), "missing-static"))
	server := New(cfg)
	defer server.Shutdown()

	httpServer := httptest.NewServer(server.http.Handler)
	defer httpServer.Close()

	wsConn := dialTerminalWebsocket(t, httpServer.URL)
	defer wsConn.Close()

	if err := wsConn.WriteJSON(map[string]any{"type": "attach", "version": 1, "cols": 80, "rows": 24}); err != nil {
		t.Fatalf("failed writing attach payload: %v", err)
	}

	errorMessage := waitForWSMessageType(t, wsConn, "error", 2*time.Second)
	if !strings.Contains(stringField(errorMessage, "message"), "Terminal attach failed") {
		t.Fatalf("expected terminal attach failure message, got %#v", errorMessage)
	}
}

func TestAttachRejectsIncompatibleWireVersion(t *testing.T) {
	cfg := testRuntimeConfig(t, true, "sh", filepath.Join(t.TempDir(), "missing-static"))
	server := New(cfg)
	defer server.Shutdown()

	httpServer := httptest.NewServer(server.http.Handler)
	defer httpServer.Close()

	wsConn := dialTerminalWebsocket(t, httpServer.URL)
	defer wsConn.Close()

	if err := wsConn.WriteJSON(map[string]any{
		"type":    "attach",
		"version": 999,
		"cols":    80,
		"rows":    24,
	}); err != nil {
		t.Fatalf("failed writing incompatible attach payload: %v", err)
	}

	errorMessage := waitForWSMessageType(t, wsConn, "error", 2*time.Second)
	if stringField(errorMessage, "code") != "incompatible_version" {
		t.Fatalf("expected incompatible_version code, got %#v", errorMessage)
	}
}

func TestCleanPathRejectsTraversal(t *testing.T) {
	baseDir := filepath.Join(t.TempDir(), "static")
	if got := cleanPath(baseDir, "/../secret.txt"); got != "" {
		t.Fatalf("expected traversal path to be rejected, got %q", got)
	}
	if got := cleanPath(baseDir, "/index.html"); got == "" {
		t.Fatal("expected valid path to resolve")
	}
}

func testRuntimeConfig(t *testing.T, fakePTY bool, command string, staticDir string) config.RuntimeConfig {
	t.Helper()
	return config.RuntimeConfig{
		Host:          "127.0.0.1",
		Port:          0,
		DetachedTTLMS: 0,
		HistoryBytes:  4096,
		FakePTY:       fakePTY,
		Command:       command,
		Args:          []string{},
		Cwd:           t.TempDir(),
		Env:           map[string]string{"TERM": "xterm-256color"},
		StaticDir:     staticDir,
	}
}

func dialTerminalWebsocket(t *testing.T, httpURL string) *websocket.Conn {
	t.Helper()
	return dialTerminalWebsocketWithHeaders(t, httpURL, nil)
}

func websocketURL(httpURL string) string {
	return "ws" + strings.TrimPrefix(httpURL, "http") + "/api/terminal"
}

func dialTerminalWebsocketWithHeaders(
	t *testing.T,
	httpURL string,
	headers http.Header,
) *websocket.Conn {
	t.Helper()
	conn, _, err := websocket.DefaultDialer.Dial(websocketURL(httpURL), headers)
	if err != nil {
		t.Fatalf("failed to dial terminal websocket: %v", err)
	}
	return conn
}

func waitForWSMessageType(t *testing.T, conn *websocket.Conn, messageType string, timeout time.Duration) map[string]any {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		message := readWSMessageMap(t, conn, time.Until(deadline))
		if message["type"] == messageType {
			return message
		}
	}
	t.Fatalf("timed out waiting for websocket message type %q", messageType)
	return nil
}

func readWSMessageMap(t *testing.T, conn *websocket.Conn, timeout time.Duration) map[string]any {
	t.Helper()
	if timeout <= 0 {
		timeout = time.Second
	}
	if err := conn.SetReadDeadline(time.Now().Add(timeout)); err != nil {
		t.Fatalf("failed setting websocket read deadline: %v", err)
	}
	_, payload, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("failed reading websocket message: %v", err)
	}

	var message map[string]any
	if err := json.Unmarshal(payload, &message); err != nil {
		t.Fatalf("failed decoding websocket payload %q: %v", string(payload), err)
	}
	return message
}

func stringField(message map[string]any, key string) string {
	value, _ := message[key].(string)
	return value
}

func readBody(t *testing.T, response *http.Response) string {
	t.Helper()
	bodyBytes, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("failed reading response body: %v", err)
	}
	return string(bodyBytes)
}
