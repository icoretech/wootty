import { describe, expect, it } from "vitest";
import { evaluateSessionsParsePolicy } from "../../../src/features/terminal/session/protocol/sessions-parse-policy";

describe("sessions parse policy", () => {
  it("fails when all entries are malformed", () => {
    const result = evaluateSessionsParsePolicy({
      totalEntries: 3,
      invalidEntries: 3,
      validEntries: 0,
    });

    expect(result).toEqual({
      ok: false,
      reason: "all_sessions_invalid",
    });
  });

  it("fails when malformed ratio exceeds threshold", () => {
    const result = evaluateSessionsParsePolicy({
      totalEntries: 4,
      invalidEntries: 2,
      validEntries: 2,
    });

    expect(result).toEqual({
      ok: false,
      reason: "too_many_invalid_sessions",
    });
  });

  it("accepts payloads under malformed threshold", () => {
    const result = evaluateSessionsParsePolicy({
      totalEntries: 5,
      invalidEntries: 2,
      validEntries: 3,
    });

    expect(result).toEqual({
      ok: true,
    });
  });
});
