import { describe, expect, it } from "vitest";
import { SESSION_REFRESH_FAILURE_REASONS } from "../../../src/features/terminal/session/application/session-refresh-result";

describe("session refresh result contract", () => {
  it("keeps the allowed failure reasons explicit and stable", () => {
    expect(SESSION_REFRESH_FAILURE_REASONS).toEqual([
      "http_error",
      "bootstrap_error",
      "json_parse_error",
      "invalid_payload",
      "missing_sessions_array",
      "all_sessions_invalid",
      "too_many_invalid_sessions",
      "request_timeout",
      "request_aborted",
      "request_superseded",
      "network_error",
    ]);
  });
});
