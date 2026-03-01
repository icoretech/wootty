import { assertNever } from "../../lib/assert-never";
import type { SessionRefreshFailure } from "../../session/protocol/session-refresh-failure-contract";
import type { BootstrapNotice } from "../contracts/bootstrap-notice";
import type { SessionsRefreshNotice } from "../contracts/session-notice";
import { toBackendResolutionNotice } from "./backend-resolution-notice";

type SessionRefreshPipelineNotice = SessionsRefreshNotice | BootstrapNotice;

type SessionRefreshFailureNotice = {
  kind: "throttle";
  failureKey: string;
  notice: SessionRefreshPipelineNotice;
};

type SessionRefreshFailureNoticeResult =
  | {
      kind: "ignore";
    }
  | SessionRefreshFailureNotice;

function parseFailureKey(
  failure: Extract<SessionRefreshFailure, { source: "parse" }>,
): string {
  switch (failure.reason) {
    case "invalid_payload":
    case "missing_sessions_array":
    case "all_sessions_invalid":
    case "too_many_invalid_sessions":
      return `payload:${failure.reason}`;
    default:
      return assertNever(failure);
  }
}

function toParseFailureNotice(
  failure: Extract<SessionRefreshFailure, { source: "parse" }>,
): SessionRefreshFailureNotice {
  switch (failure.reason) {
    case "invalid_payload":
    case "missing_sessions_array":
      return {
        kind: "throttle",
        failureKey: parseFailureKey(failure),
        notice: {
          context: "sessions_refresh",
          reason: failure.reason,
        },
      };
    case "all_sessions_invalid":
      return {
        kind: "throttle",
        failureKey: parseFailureKey(failure),
        notice: {
          context: "sessions_refresh",
          reason: "all_sessions_invalid",
          count: failure.invalidEntries,
        },
      };
    case "too_many_invalid_sessions":
      return {
        kind: "throttle",
        failureKey: parseFailureKey(failure),
        notice: {
          context: "sessions_refresh",
          reason: "too_many_invalid_sessions",
          count: failure.invalidEntries,
          total: failure.totalEntries,
        },
      };
    default:
      return assertNever(failure);
  }
}

function toFetchFailureNotice(
  failure: Extract<SessionRefreshFailure, { source: "fetch" }>,
): SessionRefreshFailureNotice {
  switch (failure.reason) {
    case "http_error":
      return {
        kind: "throttle",
        failureKey: `http:${failure.status}`,
        notice: {
          context: "sessions_refresh",
          reason: "http",
          status: failure.status,
        },
      };
    case "bootstrap_error":
      return {
        kind: "throttle",
        failureKey: "bootstrap:backend_resolution_failed",
        notice: toBackendResolutionNotice(failure.issue),
      };
    case "json_parse_error":
    case "network_error":
      return {
        kind: "throttle",
        failureKey: failure.reason,
        notice: {
          context: "sessions_refresh",
          reason: "cause",
          cause: failure.cause,
        },
      };
    default:
      return assertNever(failure);
  }
}

function toLifecycleFailureNotice(
  failure: Extract<SessionRefreshFailure, { source: "lifecycle" }>,
): SessionRefreshFailureNoticeResult {
  switch (failure.reason) {
    case "request_aborted":
    case "request_superseded":
      return {
        kind: "ignore",
      };
    case "request_timeout":
      return {
        kind: "throttle",
        failureKey: "request_timeout",
        notice: {
          context: "sessions_refresh",
          reason: "generic",
        },
      };
    case "refresh_pipeline_error":
      return {
        kind: "throttle",
        failureKey: "refresh_pipeline_error",
        notice: {
          context: "sessions_refresh",
          reason: "cause",
          cause: failure.cause,
        },
      };
    default:
      return assertNever(failure);
  }
}

export function toSessionRefreshFailureNotice(
  failure: SessionRefreshFailure,
): SessionRefreshFailureNoticeResult {
  switch (failure.source) {
    case "parse":
      return toParseFailureNotice(failure);
    case "fetch":
      return toFetchFailureNotice(failure);
    case "lifecycle":
      return toLifecycleFailureNotice(failure);
    default:
      return assertNever(failure);
  }
}
