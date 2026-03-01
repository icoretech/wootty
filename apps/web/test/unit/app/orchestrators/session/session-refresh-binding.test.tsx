import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Scheduler } from "../../../../../src/features/terminal/platform/scheduler";
import { useSessionRefreshBinding } from "../../../../../src/features/terminal/session/application/bindings/session-refresh-binding";
import {
  nextSessionRefreshDelayMs,
  SESSION_REFRESH_BOOTSTRAP_RETRY_MS,
} from "../../../../../src/features/terminal/session/application/session-refresh-policy";
import type { SessionRefreshResult } from "../../../../../src/features/terminal/session/application/session-refresh-result";

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
  requestSessionRefresh,
  onRefreshCircuitOpen,
}: {
  requestSessionRefresh: (request: {
    trigger: "poll" | "transport_event" | "manual";
    signal?: AbortSignal;
  }) => Promise<SessionRefreshResult>;
  onRefreshCircuitOpen?: (consecutiveFailures: number) => void;
}) {
  useSessionRefreshBinding({
    sessionMenuOpen: true,
    windowRef: window,
    requestSessionRefresh,
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

  it("opens refresh circuit after timeout failures reach the configured threshold", async () => {
    vi.useFakeTimers();
    try {
      const onRefreshCircuitOpen = vi.fn();
      const requestSessionRefresh = vi.fn(async () => {
        return {
          ok: false,
          failure: {
            source: "lifecycle",
            reason: "request_timeout",
            timeoutMs: 15_000,
          },
        } as const;
      });

      render(
        <SessionRefreshBindingProbe
          requestSessionRefresh={requestSessionRefresh}
          onRefreshCircuitOpen={onRefreshCircuitOpen}
        />,
      );

      const failureLimit = 6;
      for (let failureCount = 1; failureCount <= failureLimit; failureCount++) {
        await vi.advanceTimersByTimeAsync(0);
        expect(requestSessionRefresh).toHaveBeenCalledTimes(failureCount);
        if (failureCount < failureLimit) {
          await vi.advanceTimersByTimeAsync(
            nextSessionRefreshDelayMs(failureCount),
          );
        }
      }
      expect(onRefreshCircuitOpen).toHaveBeenCalledWith(6);
    } finally {
      vi.useRealTimers();
    }
  }, 200_000);

  it("retries polling after terminal bootstrap failures and resumes after resolver change", async () => {
    vi.useFakeTimers();
    try {
      const bootstrapFailureRefresh = vi.fn(async () => {
        return {
          ok: false,
          failure: {
            source: "fetch",
            reason: "bootstrap_error",
            issue: {
              code: "socket_url_invalid_format",
              details: "invalid endpoint",
            },
          },
        } as const;
      });

      const { rerender } = render(
        <SessionRefreshBindingProbe
          requestSessionRefresh={bootstrapFailureRefresh}
        />,
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(bootstrapFailureRefresh).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(nextSessionRefreshDelayMs(2) * 3);
      expect(bootstrapFailureRefresh).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(
        SESSION_REFRESH_BOOTSTRAP_RETRY_MS - nextSessionRefreshDelayMs(2) * 3,
      );
      expect(bootstrapFailureRefresh).toHaveBeenCalledTimes(2);

      const recoveredRefresh = vi.fn(async () => ({ ok: true }) as const);
      rerender(
        <SessionRefreshBindingProbe requestSessionRefresh={recoveredRefresh} />,
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(recoveredRefresh).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(nextSessionRefreshDelayMs(0));
      expect(recoveredRefresh).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
