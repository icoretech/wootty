import type { RefObject } from "react";
import type { FloatingControlsAction } from "../../commands/floating-controls/actions";
import type { SessionMenuAction } from "../../commands/session-menu-actions";
import type { StatusBarAction } from "../../commands/status-bar-actions";
import type { TerminalDomainEnvironment } from "../../environment/terminal-environment-contract";
import { useConnectionCoordinator } from "../engine/connection-coordinator";
import type { TerminalPlatformContext } from "./terminal-platform-composition";
import type { ControllerUiState } from "./terminal-session-domain";
import { useTerminalSessionDomain } from "./terminal-session-domain";
import { useUiBindingsController } from "./ui-command-adapter";

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
  const commands = useUiBindingsController({
    appViewportRef,
    sessionMenuRef,
    sessionButtonRef,
    platform,
    sessionContext: {
      lastSessionId: session.sessionState.lastSessionId,
      attachMode: session.sessionState.attachMode,
      sessionId: session.sessionState.sessionId,
      sessionMenuOpen: session.sessionState.sessionMenuOpen,
      readFontSize: session.uiState.readFontSize,
      applyFontSize: session.uiState.applyFontSize,
      setControlsOpen: session.uiState.setControlsOpen,
      setIsFullscreen: session.uiState.setIsFullscreen,
      setSessionMenuOpen: session.sessionActions.setSessionMenuOpen,
      transitionSessionContext: session.sessionActions.transitionSessionContext,
      requestSessionRefresh: session.sessionActions.requestSessionRefresh,
      publishNotice: session.sessionActions.publishNoticeDetails,
    },
    transportContext: {
      status: connection.transport.status,
      terminalReady: connection.runtime.terminalReady,
      terminalElementRef: connection.runtime.terminalElementRef,
      clearTerminal: connection.runtime.clearTerminal,
      updateFontSize: connection.runtime.updateFontSize,
      fitAndSyncSize: connection.runtime.fitAndSyncSize,
      resetRuntimeBuffers: connection.runtime.resetRuntimeBuffers,
      reconnectNow: connection.transport.reconnectNow,
      scheduleFreshConnection: connection.transport.scheduleFreshConnection,
    },
  });

  return {
    uiState: session.uiState,
    sessionState: session.sessionState,
    connectionRuntime: connection.runtime,
    connectionTransport: connection.transport,
    connectionTelemetry: connection.telemetry,
    dispatchFloatingControls: commands.dispatchFloatingControls,
    dispatchSessionMenu: commands.dispatchSessionMenu,
    dispatchStatusBar: commands.dispatchStatusBar,
  };
}
