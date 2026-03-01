const legacyWebsocketQueryTokenEnabled =
  import.meta.env.VITE_WOOTTY_WS_QUERY_TOKEN_LEGACY === "1";

export const TERMINAL_AUTH_POLICY = {
  websocket: legacyWebsocketQueryTokenEnabled ? "query_token_legacy" : "cookie",
  sessionsHttp: "bearer_header",
} as const;
