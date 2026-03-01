import { describe, expect, it } from "vitest";
import { registerFailureNotice } from "../../../src/features/terminal/notifications/notice-throttle";

describe("failure notice throttle", () => {
  it("notifies on first failure and throttles repeats within cooldown", () => {
    const first = registerFailureNotice({
      current: null,
      key: "network",
      nowMs: 1_000,
      cooldownMs: 15_000,
    });
    expect(first.shouldNotify).toBe(true);
    expect(first.count).toBe(1);

    const second = registerFailureNotice({
      current: first.next,
      key: "network",
      nowMs: 5_000,
      cooldownMs: 15_000,
    });
    expect(second.shouldNotify).toBe(false);
    expect(second.count).toBe(2);
  });

  it("re-notifies once cooldown passes and resets count for a new key", () => {
    const seeded = registerFailureNotice({
      current: null,
      key: "network",
      nowMs: 1_000,
      cooldownMs: 15_000,
    });
    const throttled = registerFailureNotice({
      current: seeded.next,
      key: "network",
      nowMs: 2_000,
      cooldownMs: 15_000,
    });
    const afterCooldown = registerFailureNotice({
      current: throttled.next,
      key: "network",
      nowMs: 20_000,
      cooldownMs: 15_000,
    });
    expect(afterCooldown.shouldNotify).toBe(true);
    expect(afterCooldown.count).toBe(3);

    const newKey = registerFailureNotice({
      current: afterCooldown.next,
      key: "protocol",
      nowMs: 21_000,
      cooldownMs: 15_000,
    });
    expect(newKey.count).toBe(1);
    expect(newKey.shouldNotify).toBe(true);
  });
});
