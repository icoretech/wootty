import { useEffect, useRef } from "react";
import type {
  Scheduler,
  SchedulerTimerHandle,
} from "../../../platform/scheduler";
import {
  nextSessionRefreshDelayMs,
  SESSION_REFRESH_CIRCUIT_BREAKER_COOLDOWN_MS,
  SESSION_REFRESH_FAILURE_LIMIT,
} from "../session-refresh-policy";

const SESSION_REFRESH_CALL_TIMEOUT_MS = 15_000;

import type { SessionRefreshResult } from "../session-refresh-result";

type SessionRefreshBindingArgs = {
  sessionMenuOpen: boolean;
  windowRef: Window | null;
  refreshLiveSessions: (requestId?: number) => Promise<SessionRefreshResult>;
  scheduler: Scheduler;
  onRefreshCircuitOpen?: (consecutiveFailures: number) => void;
};

export function useSessionRefreshBinding({
  sessionMenuOpen,
  windowRef,
  refreshLiveSessions,
  scheduler,
  onRefreshCircuitOpen,
}: SessionRefreshBindingArgs): void {
  const onRefreshCircuitOpenRef = useRef(onRefreshCircuitOpen);

  useEffect(() => {
    onRefreshCircuitOpenRef.current = onRefreshCircuitOpen;
  }, [onRefreshCircuitOpen]);

  useEffect(() => {
    if (!sessionMenuOpen || !windowRef) {
      return;
    }

    let refreshInFlight = false;
    let disposed = false;
    let refreshTimer: SchedulerTimerHandle | null = null;
    let refreshRequestId = 0;
    let consecutiveFailures = 0;
    let circuitOpen = false;

    const scheduleNext = () => {
      if (disposed) {
        return;
      }
      const delayMs = nextSessionRefreshDelayMs(consecutiveFailures);
      refreshTimer = scheduler.setTimeout(() => {
        void runRefreshLoop();
      }, delayMs);
    };

    const openCircuitBreaker = () => {
      if (disposed || circuitOpen) {
        return;
      }
      circuitOpen = true;
      onRefreshCircuitOpenRef.current?.(consecutiveFailures);
      refreshTimer = scheduler.setTimeout(() => {
        if (disposed) {
          return;
        }
        circuitOpen = false;
        consecutiveFailures = 0;
        void runRefreshLoop();
      }, SESSION_REFRESH_CIRCUIT_BREAKER_COOLDOWN_MS);
    };

    const runRefreshLoop = async () => {
      if (disposed || refreshInFlight || circuitOpen) {
        return;
      }
      refreshInFlight = true;
      try {
        refreshRequestId += 1;
        const requestId = refreshRequestId;
        let refreshTimeout: SchedulerTimerHandle | null = null;
        let timedOut = false;
        const refreshResult = await Promise.race([
          refreshLiveSessions(requestId),
          new Promise<SessionRefreshResult>((resolve) => {
            refreshTimeout = scheduler.setTimeout(() => {
              resolve({
                ok: false,
                reason: "network_error",
              });
              timedOut = true;
            }, SESSION_REFRESH_CALL_TIMEOUT_MS);
          }),
        ]);
        if (refreshTimeout !== null) {
          scheduler.clearTimeout(refreshTimeout);
        }

        if (refreshResult.ok) {
          consecutiveFailures = 0;
        } else {
          consecutiveFailures += 1;
          if (timedOut) {
            consecutiveFailures = Math.max(
              consecutiveFailures,
              SESSION_REFRESH_FAILURE_LIMIT,
            );
          }
          if (consecutiveFailures >= SESSION_REFRESH_FAILURE_LIMIT) {
            openCircuitBreaker();
          }
        }
      } finally {
        refreshInFlight = false;
        if (!circuitOpen) {
          scheduleNext();
        }
      }
    };

    void runRefreshLoop();
    return () => {
      disposed = true;
      if (refreshTimer !== null) {
        scheduler.clearTimeout(refreshTimer);
      }
    };
  }, [refreshLiveSessions, scheduler, sessionMenuOpen, windowRef]);
}
