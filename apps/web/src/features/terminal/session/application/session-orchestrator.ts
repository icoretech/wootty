import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from "react";
import type { FailureNoticeState } from "../../app/engine/notice-throttle";
import type {
  AttachMode,
  SessionSnapshot,
} from "../../contracts/session/session";
import type { SessionsFetchResult } from "../../contracts/session/sessions-fetch";
import type { TerminalStorageAccessResult } from "../../environment/terminal-environment-contract";
import { toSessionRefreshFailureNotice } from "../../notifications/mappers/session-refresh-failure-notice";
import { toStorageFailureNoticeDetails } from "../../notifications/mappers/storage-failure-notice";
import type { NoticeDetails } from "../../notifications/notice-contract";
import type { Scheduler } from "../../platform/scheduler";
import type { SessionRefreshFailure } from "../../session/protocol/session-refresh-failure-contract";
import { parseSessionsResponse } from "../../session/protocol/sessions-payload-parser";
import type { StorageAccessFailure } from "../persistence/session-storage";
import { useSessionNoticeChannel } from "./session-notice-channel";
import { useSessionPersistence } from "./session-persistence";
import { SESSION_REFRESH_CALL_TIMEOUT_MS } from "./session-refresh-policy";
import type {
  SessionRefreshRequest,
  SessionRefreshResult,
} from "./session-refresh-result";

type UseSessionOrchestratorArgs = {
  fetchSessions: (options?: {
    signal?: AbortSignal;
  }) => Promise<SessionsFetchResult>;
  getLocalStorage: () => TerminalStorageAccessResult;
  getSessionStorage: () => TerminalStorageAccessResult;
  scheduler: Scheduler;
  formatNotice: (details: NoticeDetails) => string;
};

const REFRESH_FAILURE_NOTICE_COOLDOWN_MS = 15_000;

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

type SessionOrchestratorState = {
  state: {
    sessionId: string | null;
    lastSessionId: string | null;
    sessionHistoryIds: string[];
    liveSessions: SessionSnapshot[];
    sessionNotice: string;
    attachMode: AttachMode;
    sessionMenuOpen: boolean;
    hasActiveSession: boolean;
  };
  actions: {
    setSessionMenuOpen: Dispatch<SetStateAction<boolean>>;
    publishNotice: (details: NoticeDetails) => void;
    publishSessionNotice: (message: string) => void;
    clearSessionNotice: () => void;
    reportStorageFailure: (failure: StorageAccessFailure) => void;
    setSessionMode: (mode: AttachMode) => void;
    refreshLiveSessions: (
      request: SessionRefreshRequest,
    ) => Promise<SessionRefreshResult>;
    applyReadySession: (nextSessionId: string, readOnly: boolean) => void;
    clearMissingSession: () => void;
    transitionSessionContext: (
      nextSessionId: string | null,
      nextMode: AttachMode,
    ) => void;
  };
};

export function useSessionOrchestrator({
  fetchSessions,
  getLocalStorage,
  getSessionStorage,
  scheduler,
  formatNotice,
}: UseSessionOrchestratorArgs): SessionOrchestratorState {
  const refreshFailureNoticeRef = useRef<FailureNoticeState>(null);
  const storageFailureNoticeRef = useRef<FailureNoticeState>(null);
  const latestRefreshRequestIdRef = useRef(0);
  const activeRefreshControllerRef = useRef<AbortController | null>(null);
  const pendingRefreshRef = useRef<PendingRefreshRequest | null>(null);
  const [liveSessions, setLiveSessions] = useState<SessionSnapshot[]>([]);
  const [attachMode, setAttachMode] = useState<AttachMode>("control");
  const [sessionMenuOpen, setSessionMenuOpenState] = useState<boolean>(false);

  const {
    sessionNotice,
    publishSessionNotice,
    clearSessionNotice,
    publishThrottledSessionNotice,
  } = useSessionNoticeChannel({
    scheduler,
  });
  const publishNotice = useCallback(
    (details: NoticeDetails) => {
      const message = formatNotice(details).trim();
      if (message.length === 0) {
        return;
      }
      publishSessionNotice(message);
    },
    [formatNotice, publishSessionNotice],
  );

  const reportStorageFailure = useCallback(
    (failure: StorageAccessFailure) => {
      const notice = toStorageFailureNoticeDetails(failure);
      publishThrottledSessionNotice({
        stateRef: storageFailureNoticeRef,
        failureKey: `storage:${failure.operation}:${failure.key}:${failure.reason ?? ""}`,
        message: formatNotice(notice),
        cooldownMs: REFRESH_FAILURE_NOTICE_COOLDOWN_MS,
      });
    },
    [formatNotice, publishThrottledSessionNotice],
  );

  const persistence = useSessionPersistence({
    getLocalStorage,
    getSessionStorage,
    onStorageFailure: reportStorageFailure,
  });

  const { sessionId, lastSessionId, sessionHistoryIds } = persistence.state;
  const {
    setSessionId,
    clearActiveSessionStorage,
    persistActiveSessionStorage,
    rememberSession,
  } = persistence.actions;

  const publishRefreshFailure = useCallback(
    (failure: SessionRefreshFailure) => {
      const noticeData = toSessionRefreshFailureNotice(failure);
      if (noticeData.kind === "ignore") {
        return;
      }

      const message = formatNotice(noticeData.notice);
      publishThrottledSessionNotice({
        stateRef: refreshFailureNoticeRef,
        failureKey: noticeData.failureKey,
        message,
        cooldownMs: REFRESH_FAILURE_NOTICE_COOLDOWN_MS,
      });
    },
    [formatNotice, publishThrottledSessionNotice],
  );

  const refreshLiveSessions = useCallback(
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
          publishRefreshFailure(timeoutFailure);
          return { ok: false, failure: timeoutFailure };
        }
        const response = responseOrTimeout;
        if (isStaleRequest()) {
          return { ok: false, failure: REQUEST_SUPERSEDED_FAILURE };
        }
        if (!response.ok) {
          publishRefreshFailure(response.failure);
          return { ok: false, failure: response.failure };
        }

        const parsed = parseSessionsResponse(response.payload);
        if (isStaleRequest()) {
          return { ok: false, failure: REQUEST_SUPERSEDED_FAILURE };
        }
        if (!parsed.ok) {
          publishRefreshFailure(parsed.failure);
          return { ok: false, failure: parsed.failure };
        }

        refreshFailureNoticeRef.current = null;
        setLiveSessions(parsed.sessions);
        if (parsed.invalidEntries > 0) {
          publishNotice({
            context: "sessions_refresh",
            reason: "invalid_entries",
            count: parsed.invalidEntries,
          });
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
          publishRefreshFailure(timeoutFailure);
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
        publishRefreshFailure(failure);
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
            void refreshLiveSessions({
              trigger: pending.trigger,
            });
          }
        }
      }
    },
    [fetchSessions, publishNotice, publishRefreshFailure, scheduler],
  );

  const setSessionMode = useCallback((mode: AttachMode) => {
    setAttachMode(mode);
  }, []);

  const applyReadySession = useCallback(
    (nextSessionId: string, readOnly: boolean) => {
      const nextMode: AttachMode = readOnly ? "watch" : "control";
      setSessionMode(nextMode);
      clearSessionNotice();
      setSessionId(nextSessionId);
      setSessionMenuOpenState(false);

      rememberSession(nextSessionId);
      persistActiveSessionStorage(nextSessionId);
    },
    [
      clearSessionNotice,
      persistActiveSessionStorage,
      rememberSession,
      setSessionId,
      setSessionMode,
    ],
  );

  const clearMissingSession = useCallback(() => {
    clearActiveSessionStorage();
    setSessionId(null);
    setSessionMode("control");
    setSessionMenuOpenState(false);
  }, [clearActiveSessionStorage, setSessionId, setSessionMode]);

  const transitionSessionContext = useCallback(
    (nextSessionId: string | null, nextMode: AttachMode) => {
      clearSessionNotice();
      setSessionMode(nextMode);
      setSessionId(nextSessionId);
      setSessionMenuOpenState(false);

      if (nextSessionId) {
        persistActiveSessionStorage(nextSessionId);
        return;
      }

      clearActiveSessionStorage();
    },
    [
      clearActiveSessionStorage,
      clearSessionNotice,
      persistActiveSessionStorage,
      setSessionId,
      setSessionMode,
    ],
  );

  return {
    state: {
      sessionId,
      lastSessionId,
      sessionHistoryIds,
      liveSessions,
      sessionNotice,
      attachMode,
      sessionMenuOpen,
      hasActiveSession: sessionId !== null,
    },
    actions: {
      setSessionMenuOpen: setSessionMenuOpenState,
      publishNotice,
      publishSessionNotice,
      clearSessionNotice,
      reportStorageFailure,
      setSessionMode,
      refreshLiveSessions,
      applyReadySession,
      clearMissingSession,
      transitionSessionContext,
    },
  };
}
