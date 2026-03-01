import {
  FETCH_SESSION_FAILURE_REASONS,
  type FetchSessionFailure,
} from "../../contracts/session/sessions-fetch";

export const SESSION_REFRESH_PARSE_FAILURE_REASONS = [
  "invalid_payload",
  "missing_sessions_array",
  "all_sessions_invalid",
  "too_many_invalid_sessions",
] as const;

export type SessionRefreshParseFailureReason =
  (typeof SESSION_REFRESH_PARSE_FAILURE_REASONS)[number];

export const SESSION_REFRESH_FAILURE_REASONS = [
  ...FETCH_SESSION_FAILURE_REASONS,
  ...SESSION_REFRESH_PARSE_FAILURE_REASONS,
  "request_timeout",
  "request_aborted",
  "request_superseded",
  "refresh_pipeline_error",
] as const;

export type SessionRefreshFailure =
  | FetchSessionFailure
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
      timeoutMs: number;
    }
  | {
      source: "lifecycle";
      reason: "request_aborted";
    }
  | {
      source: "lifecycle";
      reason: "request_superseded";
    }
  | {
      source: "lifecycle";
      reason: "refresh_pipeline_error";
      cause: unknown;
    };
