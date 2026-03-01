import type { TerminalBackendResolutionIssue } from "../backend-resolution";

export type SessionsFetchPayload = Record<string, unknown> & {
  sessions: unknown[];
};

export const FETCH_SESSION_FAILURE_REASONS = [
  "http_error",
  "bootstrap_error",
  "json_parse_error",
  "network_error",
] as const;

export type FetchSessionFailure =
  | {
      source: "fetch";
      reason: "http_error";
      status: number;
    }
  | {
      source: "fetch";
      reason: "bootstrap_error";
      issue: TerminalBackendResolutionIssue;
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
    };

export type SessionsFetchFailure =
  | FetchSessionFailure
  | {
      source: "lifecycle";
      reason: "request_aborted";
    };

export type SessionsFetchResult =
  | {
      ok: true;
      payload: SessionsFetchPayload;
    }
  | {
      ok: false;
      failure: SessionsFetchFailure;
    };
