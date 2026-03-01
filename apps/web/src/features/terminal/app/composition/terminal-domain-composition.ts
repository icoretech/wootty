import { type RefObject, useCallback } from "react";
import type { FloatingControlsAction } from "../../commands/floating-controls/actions";
import type { SessionMenuAction } from "../../commands/session-menu-actions";
import type { StatusBarAction } from "../../commands/status-bar-actions";
import type { TerminalDomainEnvironment } from "../../environment/terminal-environment-contract";
import {
  useSessionMenuActions,
  useTerminalCommandActions,
} from "../controller-actions";
import { useControllerBindings } from "../controller-bindings";
import { useConnectionCoordinator } from "../engine/connection-coordinator";
import type { TerminalPlatformContext } from "./terminal-platform-composition";
import type { ControllerUiState } from "./terminal-session-domain";
import { useTerminalSessionDomain } from "./terminal-session-domain";

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

export function useTerminalDomainController({
  environment,
  platform,
  appViewportRef,
  sessionMenuRef,
  sessionButtonRef,
}: {
  environment: TerminalDomainEnvironment;
  platform: TerminalPlatformContext;
  appViewportRef: RefObject<HTMLElement | null>;
  sessionMenuRef: RefObject<HTMLDivElement | null>;
  sessionButtonRef: RefObject<HTMLDivElement | null>;
}): TerminalDomainController {
  const session = useTerminalSessionDomain({
    environment,
    platform,
  });

  const connection = useConnectionCoordinator({
    createTransport: environment.createTransport,
    loadRuntime: environment.loadRuntime,
    wsUrl: session.wsUrl,
    documentRef: platform.documentRef,
    initialFontSize: session.uiState.initialFontSize,
    sessionId: session.sessionState.sessionId,
    attachMode: session.sessionState.attachMode,
    hasActiveSession: session.sessionState.hasActiveSession,
    transportEnabled: platform.backendResolution.ok,
    bootstrapFailure: !platform.backendResolution.ok,
    publishNotice: session.sessionActions.publishNoticeDetails,
    setSessionMode: session.sessionActions.setSessionMode,
    applyReadySession: session.sessionActions.applyReadySession,
    clearMissingSession: session.sessionActions.clearMissingSession,
    requestTransportRefresh: session.sessionActions.requestTransportRefresh,
    scheduler: platform.scheduler,
  });

  const toggleFullscreen = useCallback(async () => {
    const host = appViewportRef.current;
    if (!host || !platform.documentRef) {
      return;
    }
    try {
      if (platform.documentRef.fullscreenElement) {
        await platform.documentRef.exitFullscreen();
        return;
      }
      await host.requestFullscreen();
    } catch (error) {
      session.sessionActions.publishNoticeDetails({
        context: "fullscreen",
        cause: error,
      });
    }
  }, [appViewportRef, platform.documentRef, session.sessionActions]);

  const { dispatchSessionMenu } = useSessionMenuActions({
    lastSessionId: session.sessionState.lastSessionId,
    resetRuntimeBuffers: connection.runtime.resetRuntimeBuffers,
    transitionSessionContext: session.sessionActions.transitionSessionContext,
    scheduleFreshConnection: connection.transport.scheduleFreshConnection,
    reconnectNow: connection.transport.reconnectNow,
  });

  const applyFontSize = useCallback(
    (next: number) => {
      session.uiState.applyFontSize(
        next,
        connection.runtime.updateFontSize,
        connection.runtime.fitAndSyncSize,
      );
    },
    [connection.runtime, session.uiState],
  );

  const {
    dispatchShortcutAction,
    dispatchFloatingControls,
    dispatchStatusBar,
  } = useTerminalCommandActions({
    applyFontSize,
    clearTerminal: connection.runtime.clearTerminal,
    reconnectNow: connection.transport.reconnectNow,
    toggleFullscreen,
    readFontSize: session.uiState.readFontSize,
    setControlsOpen: session.uiState.setControlsOpen,
    setSessionMenuOpen: session.sessionActions.setSessionMenuOpen,
  });

  const closeSessionMenu = useCallback(() => {
    session.sessionActions.setSessionMenuOpen(false);
  }, [session.sessionActions]);

  useControllerBindings({
    documentRef: platform.documentRef,
    windowRef: platform.windowRef,
    fitAndSyncSize: connection.runtime.fitAndSyncSize,
    setIsFullscreen: session.uiState.setIsFullscreen,
    sessionMenuOpen: session.sessionState.sessionMenuOpen,
    sessionMenuRef,
    sessionButtonRef,
    closeSessionMenu,
    requestSessionRefresh: session.sessionActions.requestSessionRefresh,
    scheduler: platform.scheduler,
    attachMode: session.sessionState.attachMode,
    sessionId: session.sessionState.sessionId,
    status: connection.transport.status,
    terminalReady: connection.runtime.terminalReady,
    terminalElementRef: connection.runtime.terminalElementRef,
    runShortcutAction: dispatchShortcutAction,
    publishNotice: session.sessionActions.publishNoticeDetails,
  });

  return {
    uiState: session.uiState,
    sessionState: session.sessionState,
    connectionRuntime: connection.runtime,
    connectionTransport: connection.transport,
    connectionTelemetry: connection.telemetry,
    dispatchFloatingControls,
    dispatchSessionMenu,
    dispatchStatusBar,
  };
}
