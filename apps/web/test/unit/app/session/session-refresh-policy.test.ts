import { describe, expect, it } from "vitest";
import {
  nextSessionRefreshDelayMs,
  SESSION_REFRESH_FAILURE_LIMIT,
} from "../../../../src/features/terminal/session/application/session-refresh-policy";

describe("session refresh policy", () => {
  it("exposes the retry threshold used by refresh bindings", () => {
    expect(SESSION_REFRESH_FAILURE_LIMIT).toBeGreaterThan(1);
  });

  it("backs off refresh delays with a bounded exponential policy", () => {
    expect(nextSessionRefreshDelayMs(0)).toBe(4_000);
    expect(nextSessionRefreshDelayMs(1)).toBe(4_000);
    expect(nextSessionRefreshDelayMs(2)).toBe(8_000);
    expect(nextSessionRefreshDelayMs(3)).toBe(16_000);
    expect(nextSessionRefreshDelayMs(4)).toBe(32_000);
    expect(nextSessionRefreshDelayMs(20)).toBe(32_000);
  });
});
