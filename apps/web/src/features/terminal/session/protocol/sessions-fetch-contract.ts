import type { SessionRefreshFailure } from "./session-refresh-failure-contract";

export type SessionsFetchFailure =
  | Extract<SessionRefreshFailure, { source: "fetch" }>
  | {
      source: "lifecycle";
      reason: "request_aborted";
    };

export type SessionsFetchResult =
  | {
      ok: true;
      payload: unknown;
    }
  | {
      ok: false;
      failure: SessionsFetchFailure;
    };
