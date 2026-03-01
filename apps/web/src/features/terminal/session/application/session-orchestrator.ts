import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AttachMode, SessionSnapshot } from "../../contracts/session";
import type { FailureNoticeState } from "../../notifications/failure-notice-throttle";
import type { NoticeDetails } from "../../notifications/notice-contract";
import { createNoticePublisher } from "../../notifications/notice-publisher";
import type { Scheduler } from "../../platform/scheduler";
import type { SessionRefreshFailure } from "../../session/protocol/session-refresh-failure-contract";
import type { SessionsFetchResult } from "../../session/protocol/sessions-fetch-contract";
import { parseSessionsResponse } from "../../session/protocol/sessions-payload-parser";
import type { StorageAccessFailure } from "../persistence/session-storage";
import { useSessionNoticeChannel } from "./session-notice-channel";
import { useSessionPersistence } from "./session-persistence";
import { toSessionRefreshFailureNotice } from "./session-refresh-failure-notice";
import type {
  SessionRefreshRequest,
  SessionRefreshResult,
} from "./session-refresh-result";
import { toStorageFailureNoticeDetails } from "./storage-failure-notice";

type UseSessionOrchestratorArgs = {
  fetchSessions: (options?: {
    signal?: AbortSignal;
  }) => Promise<SessionsFetchResult>;
  getLocalStorage: () => Storage | null;
  getSessionStorage: () => Storage | null;
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
    publishSessionNotice: (message: string) => void;
    clearSessionNotice: () => void;
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
  const latestRefreshRequestIdRef = useRef(0);
  const activeRefreshControllerRef = useRef<AbortController | null>(null);
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
  const publishNotice = useMemo(
    () => createNoticePublisher(publishSessionNotice, formatNotice),
    [formatNotice, publishSessionNotice],
  );

  const reportStorageFailure = useCallback(
    (failure: StorageAccessFailure) => {
      publishNotice(toStorageFailureNoticeDetails(failure));
    },
    [publishNotice],
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
      if (!noticeData.notice) {
        return;
      }
      const message = formatNotice(noticeData.notice);
      if (!noticeData.failureKey) {
        publishSessionNotice(message);
        return;
      }
      publishThrottledSessionNotice({
        stateRef: refreshFailureNoticeRef,
        failureKey: noticeData.failureKey,
        message,
        cooldownMs: REFRESH_FAILURE_NOTICE_COOLDOWN_MS,
      });
    },
    [formatNotice, publishSessionNotice, publishThrottledSessionNotice],
  );

  const refreshLiveSessions = useCallback(
    async (request: SessionRefreshRequest): Promise<SessionRefreshResult> => {
      latestRefreshRequestIdRef.current += 1;
      const requestId = latestRefreshRequestIdRef.current;
      const previousController = activeRefreshControllerRef.current;
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
      try {
        const response = await fetchSessions({
          signal: refreshController.signal,
        });
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
          publishSessionNotice(
            formatNotice({
              context: "sessions_refresh",
              reason: "invalid_entries",
              count: parsed.invalidEntries,
            }),
          );
        }
        return { ok: true };
      } catch (error) {
        if (isStaleRequest()) {
          return { ok: false, failure: REQUEST_SUPERSEDED_FAILURE };
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
        if (request.signal) {
          request.signal.removeEventListener("abort", onOuterAbort);
        }
        if (activeRefreshControllerRef.current === refreshController) {
          activeRefreshControllerRef.current = null;
        }
      }
    },
    [fetchSessions, formatNotice, publishRefreshFailure, publishSessionNotice],
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
      publishSessionNotice,
      clearSessionNotice,
      setSessionMode,
      refreshLiveSessions,
      applyReadySession,
      clearMissingSession,
      transitionSessionContext,
    },
  };
}
