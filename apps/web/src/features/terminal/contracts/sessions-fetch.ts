import type { TerminalBackendResolutionIssue } from "./backend-resolution";

export type SessionsFetchFailure =
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
    }
  | {
      source: "lifecycle";
      reason: "request_aborted";
    };

export type SessionsFetchResult =
  | {
      ok: true;
      payload: Record<string, unknown>;
    }
  | {
      ok: false;
      failure: SessionsFetchFailure;
    };
