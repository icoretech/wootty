import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Scheduler } from "../../../../src/features/terminal/platform/scheduler";
import { useSessionRefreshBinding } from "../../../../src/features/terminal/session/application/bindings/session-refresh-binding";
import { nextSessionRefreshDelayMs } from "../../../../src/features/terminal/session/application/session-refresh-policy";
import type { SessionRefreshResult } from "../../../../src/features/terminal/session/application/session-refresh-result";

const browserLikeScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (task, delayMs) => window.setTimeout(task, delayMs),
  clearTimeout: (timerId) => {
    window.clearTimeout(timerId);
  },
  setInterval: (task, intervalMs) => window.setInterval(task, intervalMs),
  clearInterval: (timerId) => {
    window.clearInterval(timerId);
  },
};

function SessionRefreshBindingProbe({
  refreshLiveSessions,
  onRefreshCircuitOpen,
}: {
  refreshLiveSessions: (request: {
    trigger: "poll" | "transport_event" | "manual";
    signal?: AbortSignal;
  }) => Promise<SessionRefreshResult>;
  onRefreshCircuitOpen?: (consecutiveFailures: number) => void;
}) {
  useSessionRefreshBinding({
    sessionMenuOpen: true,
    windowRef: window,
    refreshLiveSessions,
    scheduler: browserLikeScheduler,
    onRefreshCircuitOpen,
  });
  return null;
}

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

  it("opens refresh circuit after repeated timeout failures", async () => {
    vi.useFakeTimers();
    try {
      const onRefreshCircuitOpen = vi.fn();
      const refreshLiveSessions = vi.fn(async () => {
        return new Promise<SessionRefreshResult>(() => {
          // Keep request pending so timeout path drives the failure.
        });
      });

      render(
        <SessionRefreshBindingProbe
          refreshLiveSessions={refreshLiveSessions}
          onRefreshCircuitOpen={onRefreshCircuitOpen}
        />,
      );

      await vi.advanceTimersByTimeAsync(15_001);
      expect(refreshLiveSessions).toHaveBeenCalledTimes(1);
      expect(onRefreshCircuitOpen).toHaveBeenCalledWith(6);
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);
});
