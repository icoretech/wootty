import { useCallback, useMemo } from "react";
import type {
  SessionsFetchResult,
  TerminalBackendResolution,
  TerminalPlatformEnvironment,
} from "../../environment/terminal-environment-contract";
import type { Scheduler } from "../../platform/scheduler";

function useBackendEndpoints(
  environment: TerminalPlatformEnvironment,
  windowRef: Window | null,
) {
  return useMemo(() => {
    return environment.resolveBackendEndpoints(windowRef);
  }, [environment, windowRef]);
}

function useFetchSessions(
  environment: TerminalPlatformEnvironment,
  backendResolution: TerminalBackendResolution,
): () => Promise<SessionsFetchResult> {
  return useCallback(() => {
    if (!backendResolution.ok) {
      return Promise.resolve({
        ok: false,
        failure: {
          reason: "bootstrap_error",
          issue: backendResolution.issue,
        },
      });
    }
    return environment.fetchSessionsPayload(
      backendResolution.endpoints.sessionsHttpUrl,
    );
  }, [backendResolution, environment]);
}

export type TerminalPlatformContext = {
  windowRef: Window | null;
  documentRef: Document | null;
  scheduler: Scheduler;
  backendResolution: TerminalBackendResolution;
  fetchSessions: () => Promise<SessionsFetchResult>;
};

export function useTerminalPlatformContext(
  environment: TerminalPlatformEnvironment,
): TerminalPlatformContext {
  const windowRef = environment.windowRef;
  const documentRef = environment.documentRef;
  const scheduler = useMemo(() => {
    return environment.scheduler;
  }, [environment.scheduler]);
  const backendResolution = useBackendEndpoints(environment, windowRef);
  const fetchSessions = useFetchSessions(environment, backendResolution);
  return {
    windowRef,
    documentRef,
    scheduler,
    backendResolution,
    fetchSessions,
  };
}
