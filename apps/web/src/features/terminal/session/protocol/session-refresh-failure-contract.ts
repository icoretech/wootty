export const SESSION_REFRESH_PARSE_FAILURE_REASONS = [
  "invalid_payload",
  "missing_sessions_array",
  "all_sessions_invalid",
  "too_many_invalid_sessions",
] as const;

export type SessionRefreshParseFailureReason =
  (typeof SESSION_REFRESH_PARSE_FAILURE_REASONS)[number];

export const SESSION_REFRESH_FAILURE_REASONS = [
  "http_error",
  "bootstrap_error",
  "json_parse_error",
  ...SESSION_REFRESH_PARSE_FAILURE_REASONS,
  "request_timeout",
  "request_aborted",
  "request_superseded",
  "network_error",
] as const;

export type SessionRefreshFailure =
  | {
      source: "fetch";
      reason: "http_error";
      status: number;
    }
  | {
      source: "fetch";
      reason: "bootstrap_error";
      issue: string;
      issueCode?: string;
    }
  | {
      source: "fetch";
      reason: "json_parse_error";
      cause: unknown;
    }
  | {
      source: "fetch";
      reason: "network_error";
      cause: unknown;
    }
  | {
      source: "parse";
      reason: "invalid_payload" | "missing_sessions_array";
    }
  | {
      source: "parse";
      reason: "all_sessions_invalid" | "too_many_invalid_sessions";
      invalidEntries: number;
      totalEntries: number;
    }
  | {
      source: "lifecycle";
      reason: "request_timeout";
    }
  | {
      source: "lifecycle";
      reason: "request_aborted";
    }
  | {
      source: "lifecycle";
      reason: "request_superseded";
    };
