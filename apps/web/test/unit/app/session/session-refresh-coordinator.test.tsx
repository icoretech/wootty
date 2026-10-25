import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionsFetchResult } from "../../../../src/features/terminal/contracts/session/sessions-fetch";
import type { Scheduler } from "../../../../src/features/terminal/platform/scheduler";
import { useSessionRefreshCoordinator } from "../../../../src/features/terminal/session/application/session-refresh-coordinator";
import { SESSION_REFRESH_CALL_TIMEOUT_MS } from "../../../../src/features/terminal/session/application/session-refresh-policy";
import { FakeScheduler } from "../../../support/harness/fake-scheduler";

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
  it("ignores obsolete timeouts when a newer refresh already succeeded", async () => {
    const scheduler = new FakeScheduler();
    const fetchSessions = vi
      .fn<() => Promise<SessionsFetchResult>>()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue(validSessionsResponse());
    const onRefreshFailure = vi.fn();
    const onRefreshSuccess = vi.fn();
    const { result } = renderHook(() =>
      useSessionRefreshCoordinator({
        fetchSessions,
        scheduler,
        onRefreshFailure,
        onRefreshSuccess,
        onInvalidEntries: vi.fn(),
      }),
    );
    const oldRequest = result.current.requestSessionRefresh({
      trigger: "poll",
    });
    await result.current.requestSessionRefresh({ trigger: "manual" });

    scheduler.advanceBy(SESSION_REFRESH_CALL_TIMEOUT_MS);
    const oldResult = await oldRequest;

    expect(oldResult).toEqual({
      ok: false,
      failure: { source: "lifecycle", reason: "request_superseded" },
    });
    expect(onRefreshFailure).not.toHaveBeenCalled();
    expect(onRefreshSuccess).toHaveBeenCalledTimes(1);
  });

  it("aborts refreshes and drops queued work on unmount", async () => {
    const scheduler = new FakeScheduler();
    const pending = Promise.withResolvers<SessionsFetchResult>();
    const signals: AbortSignal[] = [];
    const fetchSessions = vi.fn((options?: { signal?: AbortSignal }) => {
      if (options?.signal) signals.push(options.signal);
      return pending.promise;
    });
    const onRefreshFailure = vi.fn();
    const onRefreshSuccess = vi.fn();
    const { result, unmount } = renderHook(() =>
      useSessionRefreshCoordinator({
        fetchSessions,
        scheduler,
        onRefreshFailure,
        onRefreshSuccess,
        onInvalidEntries: vi.fn(),
      }),
    );
    const request = result.current.requestSessionRefresh({ trigger: "poll" });
    await result.current.requestSessionRefresh({ trigger: "transport_event" });

    unmount();
    pending.resolve(validSessionsResponse());
    await request;
    scheduler.advanceBy(SESSION_REFRESH_CALL_TIMEOUT_MS);

    expect(signals[0]?.aborted).toBe(true);
    expect(fetchSessions).toHaveBeenCalledTimes(1);
    expect(onRefreshSuccess).not.toHaveBeenCalled();
    expect(onRefreshFailure).not.toHaveBeenCalled();
  });

  it("does not publish a response that completes after its caller aborts", async () => {
    const pending = Promise.withResolvers<SessionsFetchResult>();
    const controller = new AbortController();
    const onRefreshSuccess = vi.fn();
    const { result } = renderHook(() =>
      useSessionRefreshCoordinator({
        fetchSessions: () => pending.promise,
        scheduler: browserLikeScheduler,
        onRefreshFailure: vi.fn(),
        onRefreshSuccess,
        onInvalidEntries: vi.fn(),
      }),
    );
    const request = result.current.requestSessionRefresh({
      trigger: "manual",
      signal: controller.signal,
    });

    controller.abort();
    pending.resolve(validSessionsResponse());
    const response = await request;

    expect(response).toEqual({
      ok: false,
      failure: { source: "lifecycle", reason: "request_aborted" },
    });
    expect(onRefreshSuccess).not.toHaveBeenCalled();
  });

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

  it("does not relabel callback exceptions as refresh lifecycle failures", async () => {
    const fetchSessions = vi.fn(async () => validSessionsResponse());
    const onRefreshFailure = vi.fn();
    const onRefreshSuccess = vi.fn(() => {
      throw new Error("handler exploded");
    });

    const { result } = renderHook(() => {
      return useSessionRefreshCoordinator({
        fetchSessions,
        scheduler: browserLikeScheduler,
        onRefreshFailure,
        onRefreshSuccess,
        onInvalidEntries: vi.fn(),
      });
    });

    await expect(
      result.current.requestSessionRefresh({
        trigger: "manual",
      }),
    ).rejects.toThrow("handler exploded");
    expect(onRefreshFailure).not.toHaveBeenCalled();
  });

  it("suppresses abort failure notices from fetch lifecycle outcomes", async () => {
    const fetchSessions = vi.fn(async () => {
      return {
        ok: false,
        failure: {
          source: "lifecycle",
          reason: "request_aborted",
        },
      } as const;
    });
    const onRefreshFailure = vi.fn();

    const { result } = renderHook(() => {
      return useSessionRefreshCoordinator({
        fetchSessions,
        scheduler: browserLikeScheduler,
        onRefreshFailure,
        onRefreshSuccess: vi.fn(),
        onInvalidEntries: vi.fn(),
      });
    });

    const refreshResult = await result.current.requestSessionRefresh({
      trigger: "manual",
    });

    expect(refreshResult).toEqual({
      ok: false,
      failure: {
        source: "lifecycle",
        reason: "request_aborted",
      },
    });
    expect(onRefreshFailure).not.toHaveBeenCalled();
  });
});
