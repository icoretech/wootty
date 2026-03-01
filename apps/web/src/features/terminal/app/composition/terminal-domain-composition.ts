import { type RefObject, useMemo } from "react";
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

type TerminalConnectionPort = {
  publishNotice: ReturnType<
    typeof useTerminalSessionDomain
  >["sessionActions"]["publishNoticeDetails"];
  setSessionMode: ReturnType<
    typeof useTerminalSessionDomain
  >["sessionActions"]["setSessionMode"];
  applyReadySession: ReturnType<
    typeof useTerminalSessionDomain
  >["sessionActions"]["applyReadySession"];
  clearMissingSession: ReturnType<
    typeof useTerminalSessionDomain
  >["sessionActions"]["clearMissingSession"];
  requestTransportRefresh: ReturnType<
    typeof useTerminalSessionDomain
  >["sessionActions"]["requestTransportRefresh"];
};

type TerminalUiPort = {
  publishNoticeDetails: ReturnType<
    typeof useTerminalSessionDomain
  >["sessionActions"]["publishNoticeDetails"];
  setSessionMenuOpen: ReturnType<
    typeof useTerminalSessionDomain
  >["sessionActions"]["setSessionMenuOpen"];
  transitionSessionContext: ReturnType<
    typeof useTerminalSessionDomain
  >["sessionActions"]["transitionSessionContext"];
  requestSessionRefresh: ReturnType<
    typeof useTerminalSessionDomain
  >["sessionActions"]["requestSessionRefresh"];
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
  const connectionPort = useMemo<TerminalConnectionPort>(() => {
    return {
      publishNotice: session.sessionActions.publishNoticeDetails,
      setSessionMode: session.sessionActions.setSessionMode,
      applyReadySession: session.sessionActions.applyReadySession,
      clearMissingSession: session.sessionActions.clearMissingSession,
      requestTransportRefresh: session.sessionActions.requestTransportRefresh,
    };
  }, [
    session.sessionActions.applyReadySession,
    session.sessionActions.clearMissingSession,
    session.sessionActions.publishNoticeDetails,
    session.sessionActions.requestTransportRefresh,
    session.sessionActions.setSessionMode,
  ]);
  const uiPort = useMemo<TerminalUiPort>(() => {
    return {
      publishNoticeDetails: session.sessionActions.publishNoticeDetails,
      setSessionMenuOpen: session.sessionActions.setSessionMenuOpen,
      transitionSessionContext: session.sessionActions.transitionSessionContext,
      requestSessionRefresh: session.sessionActions.requestSessionRefresh,
    };
  }, [
    session.sessionActions.publishNoticeDetails,
    session.sessionActions.requestSessionRefresh,
    session.sessionActions.setSessionMenuOpen,
    session.sessionActions.transitionSessionContext,
  ]);

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
    publishNotice: connectionPort.publishNotice,
    setSessionMode: connectionPort.setSessionMode,
    applyReadySession: connectionPort.applyReadySession,
    clearMissingSession: connectionPort.clearMissingSession,
    requestTransportRefresh: connectionPort.requestTransportRefresh,
    scheduler: platform.scheduler,
  });
  const commands = useUiBindingsController({
    appViewportRef,
    sessionMenuRef,
    sessionButtonRef,
    platform,
    session,
    sessionPort: uiPort,
    connection,
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
