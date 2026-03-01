import { useCallback, useRef } from "react";
import type { SessionSnapshot } from "../../contracts/session/session";
import type { SessionsFetchResult } from "../../contracts/session/sessions-fetch";
import type { Scheduler } from "../../platform/scheduler";
import type { SessionRefreshFailure } from "../protocol/session-refresh-failure-contract";
import { parseSessionsResponse } from "../protocol/sessions-payload-parser";
import { SESSION_REFRESH_CALL_TIMEOUT_MS } from "./session-refresh-policy";
import type {
  SessionRefreshRequest,
  SessionRefreshResult,
} from "./session-refresh-result";

const REQUEST_SUPERSEDED_FAILURE: SessionRefreshFailure = {
  source: "lifecycle",
  reason: "request_superseded",
};

const REQUEST_ABORTED_FAILURE: SessionRefreshFailure = {
  source: "lifecycle",
  reason: "request_aborted",
};

type PendingRefreshRequest = {
  trigger: SessionRefreshRequest["trigger"];
  queuedForRequestId: number;
};

function coalesceRefreshTrigger(
  current: SessionRefreshRequest["trigger"] | null,
  next: SessionRefreshRequest["trigger"],
): SessionRefreshRequest["trigger"] {
  if (next === "manual") {
    return "manual";
  }
  if (current === "manual") {
    return "manual";
  }
  if (next === "transport_event" || current === "transport_event") {
    return "transport_event";
  }
  return "poll";
}

type UseSessionRefreshCoordinatorArgs = {
  fetchSessions: (options?: {
    signal?: AbortSignal;
  }) => Promise<SessionsFetchResult>;
  scheduler: Scheduler;
  onRefreshFailure: (failure: SessionRefreshFailure) => void;
  onRefreshSuccess: (sessions: SessionSnapshot[]) => void;
  onInvalidEntries: (count: number) => void;
};

export function useSessionRefreshCoordinator({
  fetchSessions,
  scheduler,
  onRefreshFailure,
  onRefreshSuccess,
  onInvalidEntries,
}: UseSessionRefreshCoordinatorArgs): {
  requestSessionRefresh: (
    request: SessionRefreshRequest,
  ) => Promise<SessionRefreshResult>;
} {
  const latestRefreshRequestIdRef = useRef(0);
  const activeRefreshControllerRef = useRef<AbortController | null>(null);
  const pendingRefreshRef = useRef<PendingRefreshRequest | null>(null);

  const requestSessionRefresh = useCallback(
    async (request: SessionRefreshRequest): Promise<SessionRefreshResult> => {
      const previousController = activeRefreshControllerRef.current;
      if (previousController && request.trigger !== "manual") {
        const activeRequestId = latestRefreshRequestIdRef.current;
        const pendingForActiveRequest =
          pendingRefreshRef.current?.queuedForRequestId === activeRequestId
            ? pendingRefreshRef.current.trigger
            : null;
        pendingRefreshRef.current = {
          trigger: coalesceRefreshTrigger(
            pendingForActiveRequest,
            request.trigger,
          ),
          queuedForRequestId: activeRequestId,
        };
        return {
          ok: false,
          failure: REQUEST_SUPERSEDED_FAILURE,
        };
      }

      latestRefreshRequestIdRef.current += 1;
      const requestId = latestRefreshRequestIdRef.current;
      if (
        pendingRefreshRef.current &&
        pendingRefreshRef.current.queuedForRequestId !== requestId
      ) {
        pendingRefreshRef.current = null;
      }
      previousController?.abort();
      const refreshController = new AbortController();
      activeRefreshControllerRef.current = refreshController;
      const onOuterAbort = () => {
        refreshController.abort();
      };
      if (request.signal) {
        if (request.signal.aborted) {
          refreshController.abort();
        } else {
          request.signal.addEventListener("abort", onOuterAbort, {
            once: true,
          });
        }
      }
      const isStaleRequest = () => {
        return latestRefreshRequestIdRef.current !== requestId;
      };
      let refreshTimeoutHandle: ReturnType<Scheduler["setTimeout"]> | null =
        null;
      const refreshTimeoutToken = Symbol("refresh_timeout");
      let timedOut = false;
      try {
        const responseOrTimeout = await Promise.race<
          SessionsFetchResult | typeof refreshTimeoutToken
        >([
          fetchSessions({
            signal: refreshController.signal,
          }),
          new Promise<typeof refreshTimeoutToken>((resolve) => {
            refreshTimeoutHandle = scheduler.setTimeout(() => {
              timedOut = true;
              refreshController.abort();
              resolve(refreshTimeoutToken);
            }, SESSION_REFRESH_CALL_TIMEOUT_MS);
          }),
        ]);
        if (refreshTimeoutHandle !== null) {
          scheduler.clearTimeout(refreshTimeoutHandle);
        }
        if (responseOrTimeout === refreshTimeoutToken) {
          const timeoutFailure: SessionRefreshFailure = {
            source: "lifecycle",
            reason: "request_timeout",
          };
          onRefreshFailure(timeoutFailure);
          return { ok: false, failure: timeoutFailure };
        }
        const response = responseOrTimeout;
        if (isStaleRequest()) {
          return { ok: false, failure: REQUEST_SUPERSEDED_FAILURE };
        }
        if (!response.ok) {
          onRefreshFailure(response.failure);
          return { ok: false, failure: response.failure };
        }

        const parsed = parseSessionsResponse(response.payload);
        if (isStaleRequest()) {
          return { ok: false, failure: REQUEST_SUPERSEDED_FAILURE };
        }
        if (!parsed.ok) {
          onRefreshFailure(parsed.failure);
          return { ok: false, failure: parsed.failure };
        }

        onRefreshSuccess(parsed.sessions);
        if (parsed.invalidEntries > 0) {
          onInvalidEntries(parsed.invalidEntries);
        }
        return { ok: true };
      } catch (error) {
        if (isStaleRequest()) {
          return { ok: false, failure: REQUEST_SUPERSEDED_FAILURE };
        }
        if (timedOut) {
          const timeoutFailure: SessionRefreshFailure = {
            source: "lifecycle",
            reason: "request_timeout",
          };
          onRefreshFailure(timeoutFailure);
          return { ok: false, failure: timeoutFailure };
        }
        if (
          request.signal?.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return { ok: false, failure: REQUEST_ABORTED_FAILURE };
        }
        const failure: SessionRefreshFailure = {
          source: "fetch",
          reason: "network_error",
          cause: error,
        };
        onRefreshFailure(failure);
        return { ok: false, failure };
      } finally {
        if (refreshTimeoutHandle !== null) {
          scheduler.clearTimeout(refreshTimeoutHandle);
        }
        if (request.signal) {
          request.signal.removeEventListener("abort", onOuterAbort);
        }
        if (activeRefreshControllerRef.current === refreshController) {
          activeRefreshControllerRef.current = null;
        }
        if (latestRefreshRequestIdRef.current === requestId) {
          const pending = pendingRefreshRef.current;
          if (pending && pending.queuedForRequestId === requestId) {
            pendingRefreshRef.current = null;
            void requestSessionRefresh({
              trigger: pending.trigger,
            });
          }
        }
      }
    },
    [
      fetchSessions,
      onInvalidEntries,
      onRefreshFailure,
      onRefreshSuccess,
      scheduler,
    ],
  );

  return {
    requestSessionRefresh,
  };
}
