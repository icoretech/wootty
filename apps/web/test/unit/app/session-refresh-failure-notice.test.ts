import { describe, expect, it } from "vitest";
import { toSessionRefreshFailureNotice } from "../../../src/features/terminal/notifications/mappers/session-refresh-failure-notice";

describe("session refresh failure notice mapping", () => {
  it("maps every lifecycle failure reason explicitly", () => {
    expect(
      toSessionRefreshFailureNotice({
        source: "lifecycle",
        reason: "request_timeout",
      }),
    ).toEqual({
      failureKey: "request_timeout",
      notice: {
        context: "sessions_refresh",
        reason: "generic",
      },
    });
    expect(
      toSessionRefreshFailureNotice({
        source: "lifecycle",
        reason: "request_aborted",
      }),
    ).toEqual({
      failureKey: null,
      notice: null,
    });
    expect(
      toSessionRefreshFailureNotice({
        source: "lifecycle",
        reason: "request_superseded",
      }),
    ).toEqual({
      failureKey: null,
      notice: null,
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
