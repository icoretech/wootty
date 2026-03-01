import { describe, expect, it } from "vitest";
import { toSessionRefreshFailureNotice } from "../../../../src/features/terminal/notifications/mappers/session-refresh-failure-notice";

describe("session refresh failure notice mapping", () => {
  it("maps every lifecycle failure reason explicitly", () => {
    expect(
      toSessionRefreshFailureNotice({
        source: "lifecycle",
        reason: "request_timeout",
        timeoutMs: 15_000,
      }),
    ).toEqual({
      kind: "throttle",
      failureKey: "request_timeout",
      notice: {
        context: "sessions_refresh",
        reason: "request_timeout",
        timeoutMs: 15_000,
      },
    });
    expect(
      toSessionRefreshFailureNotice({
        source: "lifecycle",
        reason: "request_aborted",
      }),
    ).toEqual({
      kind: "ignore",
    });
    expect(
      toSessionRefreshFailureNotice({
        source: "lifecycle",
        reason: "request_superseded",
      }),
    ).toEqual({
      kind: "ignore",
    });
    const cause = new Error("handler exploded");
    expect(
      toSessionRefreshFailureNotice({
        source: "lifecycle",
        reason: "refresh_pipeline_error",
        cause,
      }),
    ).toEqual({
      kind: "throttle",
      failureKey: "refresh_pipeline_error",
      notice: {
        context: "sessions_refresh",
        reason: "cause",
        cause,
      },
    });
  });

  it("maps fetch and parse failures to deterministic notice payloads", () => {
    expect(
      toSessionRefreshFailureNotice({
        source: "fetch",
        reason: "bootstrap_error",
        issue: {
          code: "socket_url_invalid_format",
          details: "invalid socket",
        },
      }),
    ).toEqual({
      kind: "throttle",
      failureKey: "bootstrap:backend_resolution_failed",
      notice: {
        context: "bootstrap",
        reason: "backend_resolution_failed",
        details: "invalid socket",
        code: "socket_url_invalid_format",
      },
    });
    expect(
      toSessionRefreshFailureNotice({
        source: "parse",
        reason: "too_many_invalid_sessions",
        invalidEntries: 3,
        totalEntries: 5,
      }),
    ).toEqual({
      kind: "throttle",
      failureKey: "payload:too_many_invalid_sessions",
      notice: {
        context: "sessions_refresh",
        reason: "too_many_invalid_sessions",
        count: 3,
        total: 5,
      },
    });
  });
});
