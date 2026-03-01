import { describe, expect, it } from "vitest";
import {
  SESSION_REFRESH_FAILURE_REASONS,
  SESSION_REFRESH_PARSE_FAILURE_REASONS,
} from "../../../src/features/terminal/session/protocol/session-refresh-failure-contract";

describe("session refresh failure contract", () => {
  it("keeps parse failure reasons explicit", () => {
    expect(SESSION_REFRESH_PARSE_FAILURE_REASONS).toEqual([
      "invalid_payload",
      "missing_sessions_array",
      "all_sessions_invalid",
      "too_many_invalid_sessions",
    ]);
  });

  it("includes transport, parse, and lifecycle failure reasons", () => {
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
});
