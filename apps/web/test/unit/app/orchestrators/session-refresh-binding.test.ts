import { describe, expect, it } from "vitest";
import { nextSessionRefreshDelayMs } from "../../../../src/features/terminal/session/application/session-refresh-policy";

describe("session refresh binding delay policy", () => {
  it("applies capped exponential backoff for consecutive failures", () => {
    expect(nextSessionRefreshDelayMs(0)).toBe(4_000);
    expect(nextSessionRefreshDelayMs(1)).toBe(4_000);
    expect(nextSessionRefreshDelayMs(2)).toBe(8_000);
    expect(nextSessionRefreshDelayMs(3)).toBe(16_000);
    expect(nextSessionRefreshDelayMs(4)).toBe(32_000);
    expect(nextSessionRefreshDelayMs(8)).toBe(32_000);
  });

  it("resets to base interval once failures clear", () => {
    expect(nextSessionRefreshDelayMs(5)).toBe(32_000);
    expect(nextSessionRefreshDelayMs(0)).toBe(4_000);
  });
});
