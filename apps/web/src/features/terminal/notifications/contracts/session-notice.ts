export type SessionsRefreshNotice =
  | { context: "sessions_refresh"; reason: "generic" }
  | {
      context: "sessions_refresh";
      reason: "request_timeout";
      timeoutMs: number;
    }
  | { context: "sessions_refresh"; reason: "http"; status: number }
  | { context: "sessions_refresh"; reason: "cause"; cause: unknown }
  | { context: "sessions_refresh"; reason: "invalid_payload" }
  | { context: "sessions_refresh"; reason: "missing_sessions_array" }
  | {
      context: "sessions_refresh";
      reason: "all_sessions_invalid";
      count: number;
    }
  | {
      context: "sessions_refresh";
      reason: "too_many_invalid_sessions";
      count: number;
      total: number;
    }
  | { context: "sessions_refresh"; reason: "invalid_entries"; count: number }
  | {
      context: "sessions_refresh";
      reason: "refresh_paused_after_failures";
      count: number;
    };

export type StorageNotice = {
  context: "storage";
  operation: "read" | "write" | "remove" | "parse";
  key: string;
  reason?: string;
};

export type SessionNotice = SessionsRefreshNotice | StorageNotice;
