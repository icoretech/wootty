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

type PollingRefreshResultKind =
  | "success"
  | "ignored_failure"
  | "bootstrap_retry"
  | "counted_failure";

export function classifyPollingRefreshResult(
  result: SessionRefreshResult,
): PollingRefreshResultKind {
  if (result.ok) {
    return "success";
  }

  if (
    result.failure.reason === "request_aborted" ||
    result.failure.reason === "request_superseded"
  ) {
    return "ignored_failure";
  }

  if (result.failure.reason === "bootstrap_error") {
    return "bootstrap_retry";
  }

  return "counted_failure";
}
