import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SessionMenuAction } from "../../commands/session-menu-actions";
import type { StatusBarAction } from "../../commands/status-bar-actions";
import type { TerminalDomainEnvironment } from "../../environment/terminal-environment-contract";
import type { NoticePublisher } from "../../notifications/notice-contract";
import { createNoticePublisher } from "../../notifications/notice-publisher";
import { toUserNotice } from "../../notifications/user-notice";
import { useSessionOrchestrator } from "../../session/application/session-orchestrator";
import { toStorageFailureNoticeDetails } from "../../session/application/storage-failure-notice";
import type { StorageAccessFailure } from "../../session/persistence/session-storage";
import type { FloatingControlsAction } from "../../view/floating-controls/actions";
import {
  useSessionMenuActions,
  useTerminalCommandActions,
} from "../controller-actions";
import { useControllerBindings } from "../controller-bindings";
import { useConnectionCoordinator } from "../engine/connection-coordinator";
import {
  clampFontSize,
  readInitialFontSizeResult,
  writeFontSizePreferenceResult,
} from "../preferences/font-size-preferences";
import type { TerminalPlatformContext } from "./terminal-platform-composition";

type ControllerUiState = {
  initialFontSize: number;
  fontSize: number;
  controlsOpen: boolean;
  isFullscreen: boolean;
  setControlsOpen: (value: boolean | ((previous: boolean) => boolean)) => void;
  setIsFullscreen: (value: boolean) => void;
  readFontSize: () => number;
  applyFontSize: (
    next: number,
    applyToRuntime: (size: number, onResized: () => void) => void,
    onResized: () => void,
  ) => void;
};

type TerminalDomainController = {
  uiState: ControllerUiState;
  sessionState: ReturnType<typeof useSessionOrchestrator>["state"];
  connectionRuntime: ReturnType<typeof useConnectionCoordinator>["runtime"];
  connectionTransport: ReturnType<typeof useConnectionCoordinator>["transport"];
  connectionTelemetry: ReturnType<typeof useConnectionCoordinator>["telemetry"];
  dispatchFloatingControls: (action: FloatingControlsAction) => void;
  dispatchSessionMenu: (action: SessionMenuAction) => void;
  dispatchStatusBar: (action: StatusBarAction) => void;
};

function useControllerUiState(
  getLocalStorage: () => Storage | null,
  onStorageFailure?: (failure: StorageAccessFailure) => void,
): ControllerUiState {
  const initialFontSize = useMemo(() => {
    const result = readInitialFontSizeResult(getLocalStorage());
    if (result.error && onStorageFailure) {
      onStorageFailure(result.error);
    }
    return result.fontSize;
  }, [getLocalStorage, onStorageFailure]);
  const fontSizeRef = useRef(initialFontSize);
  const [fontSize, setFontSize] = useState<number>(initialFontSize);
  const [controlsOpen, setControlsOpen] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const applyFontSize = useCallback(
    (
      next: number,
      applyToRuntime: (size: number, onResized: () => void) => void,
      onResized: () => void,
    ) => {
      const normalized = clampFontSize(next);
      fontSizeRef.current = normalized;
      setFontSize(normalized);
      const storage = getLocalStorage();
      const writeResult = writeFontSizePreferenceResult(storage, normalized);
      if (writeResult.error && onStorageFailure) {
        onStorageFailure(writeResult.error);
      }
      applyToRuntime(normalized, onResized);
    },
    [getLocalStorage, onStorageFailure],
  );

  return {
    initialFontSize,
    fontSize,
    controlsOpen,
    isFullscreen,
    setControlsOpen,
    setIsFullscreen,
    readFontSize: () => fontSizeRef.current,
    applyFontSize,
  };
}

function useFullscreenCommand({
  appViewportRef,
  documentRef,
  publishNotice,
}: {
  appViewportRef: RefObject<HTMLDivElement | null>;
  documentRef: Document | null;
  publishNotice: NoticePublisher;
}): () => Promise<void> {
  return useCallback(async () => {
    const host = appViewportRef.current;
    if (!host || !documentRef) {
      return;
    }
    try {
      if (documentRef.fullscreenElement) {
        await documentRef.exitFullscreen();
        return;
      }
      await host.requestFullscreen();
    } catch (error) {
      publishNotice({ context: "fullscreen", cause: error });
    }
  }, [appViewportRef, documentRef, publishNotice]);
}

function useApplyFontSizeAction({
  applyFontSize,
  updateFontSize,
  fitAndSyncSize,
}: {
  applyFontSize: ControllerUiState["applyFontSize"];
  updateFontSize: (fontSize: number, onResized: () => void) => void;
  fitAndSyncSize: () => void;
}) {
  return useCallback(
    (next: number) => {
      applyFontSize(next, updateFontSize, fitAndSyncSize);
    },
    [applyFontSize, fitAndSyncSize, updateFontSize],
  );
}

function useCloseSessionMenu(setSessionMenuOpen: (open: boolean) => void) {
  return useCallback(() => {
    setSessionMenuOpen(false);
  }, [setSessionMenuOpen]);
}

export function useTerminalDomainController({
  environment,
  platform,
  appViewportRef,
  sessionMenuRef,
  sessionButtonRef,
}: {
  environment: TerminalDomainEnvironment;
  platform: TerminalPlatformContext;
  appViewportRef: RefObject<HTMLDivElement | null>;
  sessionMenuRef: RefObject<HTMLDivElement | null>;
  sessionButtonRef: RefObject<HTMLDivElement | null>;
}): TerminalDomainController {
  const session = useSessionOrchestrator({
    fetchSessions: platform.fetchSessions,
    scheduler: platform.scheduler,
    getLocalStorage: environment.getLocalStorage,
    getSessionStorage: environment.getSessionStorage,
    formatNotice: toUserNotice,
  });
  const sessionState = session.state;
  const sessionActions = session.actions;
  const publishNotice = useMemo(
    () =>
      createNoticePublisher(sessionActions.publishSessionNotice, toUserNotice),
    [sessionActions.publishSessionNotice],
  );

  const reportStorageFailure = useCallback(
    (failure: StorageAccessFailure) => {
      publishNotice(toStorageFailureNoticeDetails(failure));
    },
    [publishNotice],
  );
  const uiState = useControllerUiState(
    environment.getLocalStorage,
    reportStorageFailure,
  );
  const lastBootstrapIssueRef = useRef<string | null>(null);

  useEffect(() => {
    if (platform.backendResolution.ok) {
      lastBootstrapIssueRef.current = null;
      return;
    }
    const issueKey = `${platform.backendResolution.issue.code}:${platform.backendResolution.issue.details}`;
    if (lastBootstrapIssueRef.current === issueKey) {
      return;
    }
    lastBootstrapIssueRef.current = issueKey;
    publishNotice({
      context: "bootstrap",
      reason: "backend_resolution_failed",
      details: platform.backendResolution.issue.details,
      code: platform.backendResolution.issue.code,
    });
  }, [platform.backendResolution, publishNotice]);

  const wsUrl = platform.backendResolution.ok
    ? platform.backendResolution.endpoints.terminalWsUrl
    : null;

  const connection = useConnectionCoordinator({
    createTransport: environment.createTransport,
    loadRuntime: environment.loadRuntime,
    wsUrl,
    documentRef: platform.documentRef,
    initialFontSize: uiState.initialFontSize,
    sessionId: sessionState.sessionId,
    attachMode: sessionState.attachMode,
    hasActiveSession: sessionState.hasActiveSession,
    transportEnabled: platform.backendResolution.ok,
    publishNotice,
    setSessionMode: sessionActions.setSessionMode,
    applyReadySession: sessionActions.applyReadySession,
    clearMissingSession: sessionActions.clearMissingSession,
    refreshLiveSessions: sessionActions.refreshLiveSessions,
    scheduler: platform.scheduler,
  });
  const connectionRuntime = connection.runtime;
  const connectionTransport = connection.transport;
  const connectionTelemetry = connection.telemetry;

  const toggleFullscreen = useFullscreenCommand({
    appViewportRef,
    documentRef: platform.documentRef,
    publishNotice,
  });

  const { dispatchSessionMenu } = useSessionMenuActions({
    lastSessionId: sessionState.lastSessionId,
    resetRuntimeBuffers: connectionRuntime.resetRuntimeBuffers,
    transitionSessionContext: sessionActions.transitionSessionContext,
    scheduleFreshConnection: connectionTransport.scheduleFreshConnection,
    reconnectNow: connectionTransport.reconnectNow,
  });

  const applyFontSize = useApplyFontSizeAction({
    applyFontSize: uiState.applyFontSize,
    updateFontSize: connectionRuntime.updateFontSize,
    fitAndSyncSize: connectionRuntime.fitAndSyncSize,
  });

  const {
    dispatchShortcutAction,
    dispatchFloatingControls,
    dispatchStatusBar,
  } = useTerminalCommandActions({
    applyFontSize,
    clearTerminal: connectionRuntime.clearTerminal,
    reconnectNow: connectionTransport.reconnectNow,
    toggleFullscreen,
    readFontSize: uiState.readFontSize,
    setControlsOpen: uiState.setControlsOpen,
    setSessionMenuOpen: sessionActions.setSessionMenuOpen,
  });

  const closeSessionMenu = useCloseSessionMenu(
    sessionActions.setSessionMenuOpen,
  );

  useControllerBindings({
    documentRef: platform.documentRef,
    windowRef: platform.windowRef,
    fitAndSyncSize: connectionRuntime.fitAndSyncSize,
    setIsFullscreen: uiState.setIsFullscreen,
    sessionMenuOpen: sessionState.sessionMenuOpen,
    sessionMenuRef,
    sessionButtonRef,
    closeSessionMenu,
    refreshLiveSessions: sessionActions.refreshLiveSessions,
    scheduler: platform.scheduler,
    attachMode: sessionState.attachMode,
    sessionId: sessionState.sessionId,
    status: connectionTransport.status,
    terminalReady: connectionRuntime.terminalReady,
    terminalElementRef: connectionRuntime.terminalElementRef,
    runShortcutAction: dispatchShortcutAction,
    publishNotice,
  });

  return {
    uiState,
    sessionState,
    connectionRuntime,
    connectionTransport,
    connectionTelemetry,
    dispatchFloatingControls,
    dispatchSessionMenu,
    dispatchStatusBar,
  };
}
