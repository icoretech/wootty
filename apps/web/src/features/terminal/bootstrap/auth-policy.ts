/**
 * Authentication policy: WebSocket uses cookies (browser limitation),
 * HTTP sessions use Bearer tokens (standard REST API).
 */
export const TERMINAL_AUTH_POLICY = {
  websocket: "cookie",
  sessionsHttp: "bearer_header",
} as const;
