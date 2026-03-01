import { type RefObject, useRef } from "react";
import type { FloatingControlsAction } from "../commands/floating-controls-actions";
import type { SessionMenuAction } from "../commands/session-menu-actions";
import type { StatusBarAction } from "../commands/status-bar-actions";
import type { FloatingControlsModel } from "../components/models/floating-controls-model";
import type { SessionMenuModel } from "../components/models/session-menu-model";
import type { StatusBarModel } from "../components/models/status-bar-model";
import type { ConnectionStatus } from "../contracts/connection";
import type { TerminalAppEnvironment } from "../environment/terminal-environment-contract";
import { useTerminalDomainController } from "./composition/terminal-domain-composition";
import { useTerminalPlatformContext } from "./composition/terminal-platform-composition";
import { useTerminalPresentationModel } from "./terminal-presentation";

type TerminalController = {
  appViewportRef: RefObject<HTMLDivElement | null>;
  terminalElementRef: RefObject<HTMLDivElement | null>;
  sessionMenuRef: RefObject<HTMLDivElement | null>;
  sessionButtonRef: RefObject<HTMLDivElement | null>;
  sessionMenuOpen: boolean;
  isFullscreen: boolean;
  status: ConnectionStatus;
  terminalReady: boolean;
  statusText: string;
  statusAnnouncement: string;
  floatingControlsModel: FloatingControlsModel;
  sessionMenuModel: SessionMenuModel;
  statusBarModel: StatusBarModel;
  dispatchFloatingControls: (action: FloatingControlsAction) => void;
  dispatchSessionMenu: (action: SessionMenuAction) => void;
  dispatchStatusBar: (action: StatusBarAction) => void;
};

export function useTerminalController(
  environment: TerminalAppEnvironment,
): TerminalController {
  const appViewportRef = useRef<HTMLDivElement | null>(null);
  const sessionMenuRef = useRef<HTMLDivElement | null>(null);
  const sessionButtonRef = useRef<HTMLDivElement | null>(null);

  const platform = useTerminalPlatformContext(environment.platform);
  const domain = useTerminalDomainController({
    environment: environment.domain,
    platform,
    appViewportRef,
    sessionMenuRef,
    sessionButtonRef,
  });
  const presentation = useTerminalPresentationModel(domain);

  return {
    appViewportRef,
    terminalElementRef: domain.connectionRuntime.terminalElementRef,
    sessionMenuRef,
    sessionButtonRef,
    sessionMenuOpen: domain.sessionState.sessionMenuOpen,
    isFullscreen: domain.uiState.isFullscreen,
    status: domain.connectionTransport.status,
    terminalReady: domain.connectionRuntime.terminalReady,
    statusText: presentation.statusText,
    statusAnnouncement: presentation.statusAnnouncement,
    floatingControlsModel: presentation.floatingControlsModel,
    sessionMenuModel: presentation.sessionMenuModel,
    statusBarModel: presentation.statusBarModel,
    dispatchFloatingControls: domain.dispatchFloatingControls,
    dispatchSessionMenu: domain.dispatchSessionMenu,
    dispatchStatusBar: domain.dispatchStatusBar,
  };
}
