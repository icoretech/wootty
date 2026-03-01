import { useCallback, useMemo } from "react";
import type { TerminalBackendResolution } from "../../contracts/backend-resolution";
import type { SessionsFetchResult } from "../../contracts/sessions-fetch";
import type { TerminalPlatformEnvironment } from "../../environment/terminal-environment-contract";
import type { Scheduler } from "../../platform/scheduler";

function useFetchSessions(
  environment: TerminalPlatformEnvironment,
  backendResolution: TerminalBackendResolution,
): (options?: { signal?: AbortSignal }) => Promise<SessionsFetchResult> {
  const sessionsHttpUrl = backendResolution.ok
    ? backendResolution.endpoints.sessionsHttpUrl
    : null;
  const bootstrapIssue = backendResolution.ok ? null : backendResolution.issue;
  return useCallback(
    (options?: { signal?: AbortSignal }) => {
      if (bootstrapIssue) {
        return Promise.resolve({
          ok: false,
          failure: {
            source: "fetch",
            reason: "bootstrap_error",
            issue: bootstrapIssue,
          },
        });
      }
      if (!sessionsHttpUrl) {
        return Promise.resolve({
          ok: false,
          failure: {
            source: "fetch",
            reason: "network_error",
            cause: new Error("sessions endpoint unavailable"),
          },
        });
      }
      return environment.fetchSessionsPayload(sessionsHttpUrl, options);
    },
    [bootstrapIssue, environment.fetchSessionsPayload, sessionsHttpUrl],
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
  environment: TerminalPlatformEnvironment,
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
