import type { RefObject } from "react";
import type { FloatingControlsAction } from "../../commands/floating-controls/actions";
import type { SessionMenuAction } from "../../commands/session-menu-actions";
import type { StatusBarAction } from "../../commands/status-bar-actions";
import type { TerminalDomainEnvironment } from "../../environment/terminal-environment-contract";
import { useSessionAttachmentController } from "./session-domain-adapter";
import type { TerminalPlatformContext } from "./terminal-platform-composition";
import type { ControllerUiState } from "./terminal-session-domain";
import { useTransportRuntimeBridge } from "./transport-runtime-adapter";
import { useUiBindingsController } from "./ui-command-adapter";

type TerminalDomainController = {
  uiState: ControllerUiState;
  sessionState: ReturnType<
    typeof useSessionAttachmentController
  >["sessionState"];
  connectionRuntime: ReturnType<
    typeof useTransportRuntimeBridge
  >["connectionRuntime"];
  connectionTransport: ReturnType<
    typeof useTransportRuntimeBridge
  >["connectionTransport"];
  connectionTelemetry: ReturnType<
    typeof useTransportRuntimeBridge
  >["connectionTelemetry"];
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
  const session = useSessionAttachmentController({
    environment,
    platform,
  });
  const bridge = useTransportRuntimeBridge({
    environment,
    platform,
    session,
  });
  const commands = useUiBindingsController({
    appViewportRef,
    sessionMenuRef,
    sessionButtonRef,
    platform,
    session,
    bridge,
  });

  return {
    uiState: session.uiState,
    sessionState: session.sessionState,
    connectionRuntime: bridge.connectionRuntime,
    connectionTransport: bridge.connectionTransport,
    connectionTelemetry: bridge.connectionTelemetry,
    dispatchFloatingControls: commands.dispatchFloatingControls,
    dispatchSessionMenu: commands.dispatchSessionMenu,
    dispatchStatusBar: commands.dispatchStatusBar,
  };
}
