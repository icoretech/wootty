import {
  SESSION_REFRESH_FAILURE_REASONS,
  type SessionRefreshFailure,
} from "../protocol/session-refresh-failure-contract";

export { SESSION_REFRESH_FAILURE_REASONS };
export type { SessionRefreshFailure };

export type SessionRefreshTrigger = "poll" | "transport_event" | "manual";

export type SessionRefreshRequest = {
  readonly trigger: SessionRefreshTrigger;
  readonly signal?: AbortSignal;
};

export type SessionRefreshResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly failure: SessionRefreshFailure;
    };
