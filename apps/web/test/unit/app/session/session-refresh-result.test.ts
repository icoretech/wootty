import { describe, expect, it } from "vitest";
import {
  classifyPollingRefreshResult,
  SESSION_REFRESH_FAILURE_REASONS,
} from "../../../../src/features/terminal/session/application/session-refresh-result";

describe("session refresh result contract", () => {
  it("keeps the allowed failure reasons explicit and stable", () => {
    expect(SESSION_REFRESH_FAILURE_REASONS).toEqual([
      "http_error",
      "bootstrap_error",
      "json_parse_error",
      "network_error",
      "invalid_payload",
      "missing_sessions_array",
      "all_sessions_invalid",
      "too_many_invalid_sessions",
      "request_timeout",
      "request_aborted",
      "request_superseded",
      "refresh_pipeline_error",
    ]);
  });

  it("classifies polling outcomes without leaking raw failure reasons into bindings", () => {
    expect(classifyPollingRefreshResult({ ok: true })).toBe("success");
    expect(
      classifyPollingRefreshResult({
        ok: false,
        failure: {
          source: "lifecycle",
          reason: "request_aborted",
        },
      }),
    ).toBe("ignored_failure");
    expect(
      classifyPollingRefreshResult({
        ok: false,
        failure: {
          source: "fetch",
          reason: "bootstrap_error",
          issue: {
            code: "socket_url_invalid_format",
            details: "invalid endpoint",
          },
        },
      }),
    ).toBe("bootstrap_retry");
    expect(
      classifyPollingRefreshResult({
        ok: false,
        failure: {
          source: "lifecycle",
          reason: "request_timeout",
          timeoutMs: 15_000,
        },
      }),
    ).toBe("counted_failure");
  });
});
