export const SESSION_REFRESH_FAILURE_REASONS = [
  "http_error",
  "bootstrap_error",
  "json_parse_error",
  "invalid_payload",
  "missing_sessions_array",
  "network_error",
] as const;

export type SessionRefreshFailureReason =
  (typeof SESSION_REFRESH_FAILURE_REASONS)[number];

export type SessionRefreshResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly reason: SessionRefreshFailureReason;
    };
