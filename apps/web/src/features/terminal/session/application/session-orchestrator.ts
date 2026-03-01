import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AttachMode, SessionSnapshot } from "../../contracts/session";
import type { SessionsFetchResult } from "../../environment/terminal-environment-contract";
import type { FailureNoticeState } from "../../notifications/failure-notice-throttle";
import type { NoticeDetails } from "../../notifications/notice-contract";
import { createNoticePublisher } from "../../notifications/notice-publisher";
import type { Scheduler } from "../../platform/scheduler";
import { parseSessionsResponse } from "../../session/protocol/sessions-payload-parser";
import type { StorageAccessFailure } from "../persistence/session-storage";
import { useSessionNoticeChannel } from "./session-notice-channel";
import { useSessionPersistence } from "./session-persistence";
import type { SessionRefreshResult } from "./session-refresh-result";
import { toStorageFailureNoticeDetails } from "./storage-failure-notice";

type UseSessionOrchestratorArgs = {
  fetchSessions: () => Promise<SessionsFetchResult>;
  getLocalStorage: () => Storage | null;
  getSessionStorage: () => Storage | null;
  scheduler: Scheduler;
  formatNotice: (details: NoticeDetails) => string;
};

const REFRESH_FAILURE_NOTICE_COOLDOWN_MS = 15_000;

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
    refreshLiveSessions: (requestId?: number) => Promise<SessionRefreshResult>;
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
    (failureKey: string, message: string) => {
      publishThrottledSessionNotice({
        stateRef: refreshFailureNoticeRef,
        failureKey,
        message,
        cooldownMs: REFRESH_FAILURE_NOTICE_COOLDOWN_MS,
      });
    },
    [publishThrottledSessionNotice],
  );

  const refreshLiveSessions = useCallback(
    async (requestId?: number): Promise<SessionRefreshResult> => {
      if (typeof requestId === "number") {
        latestRefreshRequestIdRef.current = requestId;
      }
      const isStaleRequest = () => {
        return (
          typeof requestId === "number" &&
          latestRefreshRequestIdRef.current !== requestId
        );
      };
      try {
        const response = await fetchSessions();
        if (isStaleRequest()) {
          return { ok: false, reason: "network_error" };
        }
        if (!response.ok) {
          if (response.failure.reason === "http_error") {
            publishRefreshFailure(
              `http:${response.failure.status}`,
              formatNotice({
                context: "sessions_refresh",
                reason: "http",
                status: response.failure.status,
              }),
            );
            return { ok: false, reason: "http_error" };
          }
          if (response.failure.reason === "bootstrap_error") {
            publishSessionNotice(
              formatNotice({
                context: "bootstrap",
                reason: "backend_resolution_failed",
                details: response.failure.issue,
              }),
            );
            return { ok: false, reason: "bootstrap_error" };
          }
          if (response.failure.reason === "json_parse_error") {
            publishRefreshFailure(
              "payload:json_parse_error",
              formatNotice({
                context: "sessions_refresh",
                reason: "cause",
                cause: response.failure.cause,
              }),
            );
            return { ok: false, reason: "json_parse_error" };
          }
          publishRefreshFailure(
            "network",
            formatNotice({
              context: "sessions_refresh",
              reason: "cause",
              cause: response.failure.cause,
            }),
          );
          return { ok: false, reason: "network_error" };
        }

        const parsed = parseSessionsResponse(response.payload);
        if (isStaleRequest()) {
          return { ok: false, reason: "network_error" };
        }
        if (!parsed.ok) {
          publishRefreshFailure(
            `payload:${parsed.reason}`,
            formatNotice({
              context: "sessions_refresh",
              reason: parsed.reason,
            }),
          );
          return { ok: false, reason: parsed.reason };
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
          return { ok: false, reason: "network_error" };
        }
        publishRefreshFailure(
          "network",
          formatNotice({
            context: "sessions_refresh",
            reason: "cause",
            cause: error,
          }),
        );
        return { ok: false, reason: "network_error" };
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
