import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionsFetchResult } from "../../../../src/features/terminal/contracts/session/sessions-fetch";
import type { Scheduler } from "../../../../src/features/terminal/platform/scheduler";
import { useSessionRefreshCoordinator } from "../../../../src/features/terminal/session/application/session-refresh-coordinator";

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

function validSessionsResponse(): SessionsFetchResult {
  return {
    ok: true,
    payload: {
      sessions: [
        {
          id: "session-1",
          hasController: true,
          canControl: true,
          watchers: 0,
          createdAtMs: 10,
          lastActivityMs: 12,
        },
      ],
    },
  };
}

describe("session refresh coordinator", () => {
  it("reports successful refreshes and invalid entry counts", async () => {
    const fetchSessions = vi.fn(async () => {
      return {
        ok: true,
        payload: {
          sessions: [
            {
              id: "session-1",
              hasController: true,
              canControl: true,
              watchers: 0,
              createdAtMs: 10,
              lastActivityMs: 12,
            },
            {
              id: "session-2",
              hasController: true,
              canControl: true,
              watchers: "invalid",
              createdAtMs: 11,
              lastActivityMs: 13,
            },
          ],
        },
      } as const;
    });
    const onRefreshFailure = vi.fn();
    const onRefreshSuccess = vi.fn();
    const onInvalidEntries = vi.fn();

    const { result } = renderHook(() => {
      return useSessionRefreshCoordinator({
        fetchSessions,
        scheduler: browserLikeScheduler,
        onRefreshFailure,
        onRefreshSuccess,
        onInvalidEntries,
      });
    });

    const refreshResult = await result.current.requestSessionRefresh({
      trigger: "manual",
    });

    expect(refreshResult).toEqual({ ok: true });
    expect(onRefreshFailure).not.toHaveBeenCalled();
    expect(onRefreshSuccess).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "session-1",
      }),
    ]);
    expect(onInvalidEntries).toHaveBeenCalledWith(1);
  });

  it("coalesces non-manual triggers while a request is in-flight", async () => {
    let resolveFirstRequest: ((response: SessionsFetchResult) => void) | null =
      null;
    let callCount = 0;
    const fetchSessions = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise<SessionsFetchResult>((resolve) => {
          resolveFirstRequest = resolve;
        });
      }
      return validSessionsResponse();
    });
    const onRefreshFailure = vi.fn();
    const onRefreshSuccess = vi.fn();
    const onInvalidEntries = vi.fn();

    const { result } = renderHook(() => {
      return useSessionRefreshCoordinator({
        fetchSessions,
        scheduler: browserLikeScheduler,
        onRefreshFailure,
        onRefreshSuccess,
        onInvalidEntries,
      });
    });

    const firstRequest = result.current.requestSessionRefresh({
      trigger: "poll",
    });

    const superseded = await result.current.requestSessionRefresh({
      trigger: "transport_event",
    });
    expect(superseded).toEqual({
      ok: false,
      failure: {
        source: "lifecycle",
        reason: "request_superseded",
      },
    });
    expect(fetchSessions).toHaveBeenCalledTimes(1);

    resolveFirstRequest?.(validSessionsResponse());
    await firstRequest;
    await waitFor(() => {
      expect(fetchSessions).toHaveBeenCalledTimes(2);
    });
    expect(onRefreshFailure).not.toHaveBeenCalled();
    expect(onRefreshSuccess).toHaveBeenCalledTimes(2);
    expect(onInvalidEntries).not.toHaveBeenCalled();
  });

  it("aborts an active request when a manual refresh takes ownership", async () => {
    const seenSignals: AbortSignal[] = [];
    const fetchSessions = vi.fn(
      async (options?: {
        signal?: AbortSignal;
      }): Promise<SessionsFetchResult> => {
        const signal = options?.signal;
        if (signal) {
          seenSignals.push(signal);
        }
        if (seenSignals.length === 1) {
          return new Promise<SessionsFetchResult>((_, reject) => {
            signal?.addEventListener(
              "abort",
              () => {
                reject(new DOMException("aborted", "AbortError"));
              },
              { once: true },
            );
          });
        }
        return validSessionsResponse();
      },
    );

    const { result } = renderHook(() => {
      return useSessionRefreshCoordinator({
        fetchSessions,
        scheduler: browserLikeScheduler,
        onRefreshFailure: vi.fn(),
        onRefreshSuccess: vi.fn(),
        onInvalidEntries: vi.fn(),
      });
    });

    const pollRequest = result.current.requestSessionRefresh({
      trigger: "poll",
    });
    await waitFor(() => {
      expect(seenSignals.length).toBe(1);
    });

    const manualResult = await result.current.requestSessionRefresh({
      trigger: "manual",
    });
    const pollResult = await pollRequest;

    expect(seenSignals[0]?.aborted).toBe(true);
    expect(manualResult).toEqual({ ok: true });
    expect(pollResult).toEqual({
      ok: false,
      failure: {
        source: "lifecycle",
        reason: "request_superseded",
      },
    });
  });
});
