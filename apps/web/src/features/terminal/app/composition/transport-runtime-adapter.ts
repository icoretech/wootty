import type { TerminalDomainEnvironment } from "../../environment/terminal-environment-contract";
import { useConnectionCoordinator } from "../engine/connection-coordinator";
import type { SessionAttachmentController } from "./session-domain-adapter";
import type { TerminalPlatformContext } from "./terminal-platform-composition";

export type TransportRuntimeBridge = {
  connectionRuntime: ReturnType<typeof useConnectionCoordinator>["runtime"];
  connectionTransport: ReturnType<typeof useConnectionCoordinator>["transport"];
  connectionTelemetry: ReturnType<typeof useConnectionCoordinator>["telemetry"];
};

export function useTransportRuntimeBridge({
  environment,
  platform,
  session,
}: {
  environment: TerminalDomainEnvironment;
  platform: TerminalPlatformContext;
  session: SessionAttachmentController;
}): TransportRuntimeBridge {
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
    publishNotice: session.publishNotice,
    setSessionMode: session.sessionActions.setSessionMode,
    applyReadySession: session.sessionActions.applyReadySession,
    clearMissingSession: session.sessionActions.clearMissingSession,
    refreshLiveSessions: session.sessionActions.refreshLiveSessions,
    scheduler: platform.scheduler,
  });

  return {
    connectionRuntime: connection.runtime,
    connectionTransport: connection.transport,
    connectionTelemetry: connection.telemetry,
  };
}
