import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from "react";
import type {
  AttachMode,
  SessionSnapshot,
} from "../../contracts/session/session";
import type { SessionsFetchResult } from "../../contracts/session/sessions-fetch";
import type { TerminalStorageAccessResult } from "../../environment/terminal-environment-contract";
import { toSessionRefreshFailureNotice } from "../../notifications/mappers/session-refresh-failure-notice";
import { toStorageFailureNoticeDetails } from "../../notifications/mappers/storage-failure-notice";
import type {
  NoticeDetails,
  NoticePublisher,
} from "../../notifications/notice-contract";
import type { FailureNoticeState } from "../../notifications/notice-throttle";
import type { Scheduler } from "../../platform/scheduler";
import type { SessionRefreshFailure } from "../../session/protocol/session-refresh-failure-contract";
import type { StorageAccessFailure } from "../persistence/session-storage";
import { useSessionNoticeChannel } from "./session-notice-channel";
import { useSessionPersistence } from "./session-persistence";
import { useSessionRefreshCoordinator } from "./session-refresh-coordinator";
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
const TRANSPORT_REFRESH_MIN_INTERVAL_MS = 750;

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
    publishNoticeDetails: NoticePublisher;
    publishSessionNotice: (message: string) => void;
    clearSessionNotice: () => void;
    reportStorageFailure: (failure: StorageAccessFailure) => void;
    setSessionMode: (mode: AttachMode) => void;
    requestSessionRefresh: (
      request: SessionRefreshRequest,
    ) => Promise<SessionRefreshResult>;
    requestTransportRefresh: () => Promise<SessionRefreshResult>;
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
  const lastTransportRefreshAtRef = useRef<number>(Number.NEGATIVE_INFINITY);
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

  const { requestSessionRefresh } = useSessionRefreshCoordinator({
    fetchSessions,
    scheduler,
    onRefreshFailure: publishRefreshFailure,
    onRefreshSuccess: (sessions) => {
      refreshFailureNoticeRef.current = null;
      setLiveSessions(sessions);
    },
    onInvalidEntries: (count) => {
      publishNotice({
        context: "sessions_refresh",
        reason: "invalid_entries",
        count,
      });
    },
  });

  const requestTransportRefresh = useCallback(() => {
    const now = scheduler.now();
    if (
      now - lastTransportRefreshAtRef.current <
      TRANSPORT_REFRESH_MIN_INTERVAL_MS
    ) {
      return Promise.resolve({
        ok: false,
        failure: {
          source: "lifecycle" as const,
          reason: "request_superseded" as const,
        },
      });
    }
    lastTransportRefreshAtRef.current = now;
    return requestSessionRefresh({
      trigger: "transport_event",
    });
  }, [requestSessionRefresh, scheduler]);

  const publishNoticeDetails = useCallback<NoticePublisher>(
    (details) => {
      publishNotice(details);
    },
    [publishNotice],
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
      publishNoticeDetails,
      publishSessionNotice,
      clearSessionNotice,
      reportStorageFailure,
      setSessionMode,
      requestSessionRefresh,
      requestTransportRefresh,
      applyReadySession,
      clearMissingSession,
      transitionSessionContext,
    },
  };
}
