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
    transport: {
      createTransport: environment.createTransport,
      wsUrl: session.wsUrl,
      transportEnabled: platform.backendResolution.ok,
      bootstrapFailure: !platform.backendResolution.ok,
      scheduler: platform.scheduler,
    },
    runtime: {
      loadRuntime: environment.loadRuntime,
      documentRef: platform.documentRef,
      initialFontSize: session.uiState.initialFontSize,
    },
    session: {
      ...session.connectionSession,
    },
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
    platform: {
      documentRef: platform.documentRef,
      windowRef: platform.windowRef,
      scheduler: platform.scheduler,
    },
    session: {
      sessionMenuOpen: session.sessionState.sessionMenuOpen,
      sessionMenuRef,
      sessionButtonRef,
      closeSessionMenu,
      requestSessionRefresh: session.sessionActions.requestSessionRefresh,
      attachMode: session.sessionState.attachMode,
      sessionId: session.sessionState.sessionId,
      publishNotice: session.sessionActions.publishNoticeDetails,
    },
    terminal: {
      fitAndSyncSize: connection.runtime.fitAndSyncSize,
      setIsFullscreen: session.uiState.setIsFullscreen,
      status: connection.transport.status,
      terminalReady: connection.runtime.terminalReady,
      terminalElementRef: connection.runtime.terminalElementRef,
      runShortcutAction: dispatchShortcutAction,
    },
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
