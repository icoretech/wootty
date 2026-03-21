/**
 * Authentication policy: both WebSocket and HTTP requests rely on the
 * authenticated cookie established during browser bootstrap.
 */
export const TERMINAL_AUTH_POLICY = {
  websocket: "cookie",
  sessionsHttp: "cookie",
} as const;
