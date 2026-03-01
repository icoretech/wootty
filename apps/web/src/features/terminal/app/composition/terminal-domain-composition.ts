import { type RefObject, useCallback } from "react";
import type { FloatingControlsAction } from "../../commands/floating-controls/actions";
import type { SessionMenuAction } from "../../commands/session-menu-actions";
import type { StatusBarAction } from "../../commands/status-bar-actions";
import type { TerminalDomainEnvironment } from "../../environment/terminal-environment-contract";
import type { NoticePublisher } from "../../notifications/notice-contract";
import {
  useSessionMenuActions,
  useTerminalCommandActions,
} from "../controller-actions";
import { useControllerBindings } from "../controller-bindings";
import { useConnectionCoordinator } from "../engine/connection-coordinator";
import type { TerminalPlatformContext } from "./terminal-platform-composition";
import {
  type ControllerUiState,
  useTerminalSessionDomain,
} from "./terminal-session-domain";

type TerminalDomainController = {
  uiState: ControllerUiState;
  sessionState: ReturnType<typeof useTerminalSessionDomain>["sessionState"];
  connectionRuntime: ReturnType<typeof useConnectionCoordinator>["runtime"];
  connectionTransport: ReturnType<typeof useConnectionCoordinator>["transport"];
  connectionTelemetry: ReturnType<typeof useConnectionCoordinator>["telemetry"];
  dispatchFloatingControls: (action: FloatingControlsAction) => void;
  dispatchSessionMenu: (action: SessionMenuAction) => void;
  dispatchStatusBar: (action: StatusBarAction) => void;
};

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
  const { uiState, sessionState, sessionActions, publishNotice, wsUrl } =
    useTerminalSessionDomain({
      environment,
      platform,
    });

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
