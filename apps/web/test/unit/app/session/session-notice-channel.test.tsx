import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Scheduler } from "../../../../src/features/terminal/platform/scheduler";
import { useSessionNoticeChannel } from "../../../../src/features/terminal/session/application/session-notice-channel";
import type { FailureNoticeState } from "../../../../src/features/terminal/shared/reliability/failure-notice-throttle";

const scheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (task, delayMs) => window.setTimeout(task, delayMs),
  clearTimeout: (timerId) => {
    window.clearTimeout(timerId);
  },
  setInterval: (task, delayMs) => window.setInterval(task, delayMs),
  clearInterval: (timerId) => {
    window.clearInterval(timerId);
  },
};

describe("session notice channel", () => {
  it("publishes and clears notices", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => {
      return useSessionNoticeChannel({ scheduler });
    });

    act(() => {
      result.current.publishSessionNotice("refresh failed");
    });
    expect(result.current.sessionNotice).toBe("refresh failed");

    act(() => {
      result.current.clearSessionNotice();
    });
    expect(result.current.sessionNotice).toBe("");
    vi.useRealTimers();
  });

  it("throttles repeated failure notices", () => {
    vi.useFakeTimers();
    const failureState: { current: FailureNoticeState } = { current: null };
    const { result } = renderHook(() => {
      return useSessionNoticeChannel({ scheduler });
    });

    act(() => {
      result.current.publishThrottledSessionNotice({
        stateRef: failureState,
        failureKey: "network",
        message: "network down",
        cooldownMs: 30_000,
      });
    });
    expect(result.current.sessionNotice).toBe("network down");

    act(() => {
      result.current.clearSessionNotice();
      result.current.publishThrottledSessionNotice({
        stateRef: failureState,
        failureKey: "network",
        message: "network down",
        cooldownMs: 30_000,
      });
    });
    expect(result.current.sessionNotice).toBe("");
    vi.useRealTimers();
  });
});
