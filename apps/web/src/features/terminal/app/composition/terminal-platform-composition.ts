import { useCallback, useMemo } from "react";
import type { TerminalBackendResolution } from "../../contracts/backend-resolution";
import type { SessionsFetchResult } from "../../contracts/session/sessions-fetch";
import type { TerminalAppEnvironment } from "../../environment/terminal-environment-contract";
import type { Scheduler } from "../../platform/scheduler";

function useFetchSessions(
  environment: TerminalAppEnvironment,
  backendResolution: TerminalBackendResolution,
): (options?: { signal?: AbortSignal }) => Promise<SessionsFetchResult> {
  return useCallback(
    (options?: { signal?: AbortSignal }) => {
      if (!backendResolution.ok) {
        return Promise.resolve({
          ok: false,
          failure: {
            source: "fetch",
            reason: "bootstrap_error",
            issue: backendResolution.issue,
          },
        });
      }
      return environment.fetchSessionsPayload(
        backendResolution.endpoints.sessionsHttpUrl,
        options,
      );
    },
    [backendResolution, environment.fetchSessionsPayload],
  );
}

export type TerminalPlatformContext = {
  windowRef: Window | null;
  documentRef: Document | null;
  scheduler: Scheduler;
  backendResolution: TerminalBackendResolution;
  fetchSessions: (options?: {
    signal?: AbortSignal;
  }) => Promise<SessionsFetchResult>;
};

export function useTerminalPlatformContext(
  environment: TerminalAppEnvironment,
): TerminalPlatformContext {
  const windowRef = environment.windowRef;
  const documentRef = environment.documentRef;
  const scheduler = useMemo(() => {
    return environment.scheduler;
  }, [environment.scheduler]);
  const backendResolution = environment.resolveBackendEndpoints(windowRef);
  const fetchSessions = useFetchSessions(environment, backendResolution);
  return {
    windowRef,
    documentRef,
    scheduler,
    backendResolution,
    fetchSessions,
  };
}
