import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useMemo,
  useRef,
} from "react";
import type { FloatingControlsAction } from "../../commands/floating-controls/actions";
import type { SessionMenuAction } from "../../commands/session-menu-actions";
import type { StatusBarAction } from "../../commands/status-bar-actions";
import type { ConnectionStatus } from "../../contracts/connection";
import type { TerminalAppEnvironment } from "../../environment/terminal-environment-contract";
import type { FloatingControlsModel } from "../../view/floating-controls-model";
import type { SessionMenuModel } from "../../view/session-menu-model";
import type { StatusBarModel } from "../../view/status-bar-model";
import { useTerminalDomainController } from "../composition/terminal-domain-composition";
import { useTerminalPlatformContext } from "../composition/terminal-platform-composition";
import { buildTerminalPresentationModel } from "./terminal-presentation";

type TerminalController = {
  appViewportRef: RefObject<HTMLElement | null>;
  terminalElementRef: RefObject<HTMLDivElement | null>;
  sessionMenuRef: RefObject<HTMLDivElement | null>;
  sessionButtonRef: RefObject<HTMLDivElement | null>;
  sessionMenuOpen: boolean;
  isFullscreen: boolean;
  helpOpen: boolean;
  setHelpOpen: Dispatch<SetStateAction<boolean>>;
  status: ConnectionStatus;
  terminalReady: boolean;
  statusText: string;
  statusAnnouncement: string;
  floatingControlsModel: FloatingControlsModel;
  sessionMenuModel: SessionMenuModel;
  statusBarModel: StatusBarModel;
  aboutSession: {
    id: string | null;
    name: string | null;
    command: string | null;
    attachMode: "control" | "watch";
    status: string;
    watchers: number;
  };
  dispatchFloatingControls: (action: FloatingControlsAction) => void;
  dispatchSessionMenu: (action: SessionMenuAction) => void;
  dispatchStatusBar: (action: StatusBarAction) => void;
};

export function useTerminalController(
  environment: TerminalAppEnvironment,
): TerminalController {
  const appViewportRef = useRef<HTMLElement | null>(null);
  const sessionMenuRef = useRef<HTMLDivElement | null>(null);
  const sessionButtonRef = useRef<HTMLDivElement | null>(null);

  const platform = useTerminalPlatformContext(environment);
  const domain = useTerminalDomainController({
    environment,
    platform,
    appViewportRef,
    sessionMenuRef,
    sessionButtonRef,
  });
  const presentation = buildTerminalPresentationModel(domain);

  const aboutSession = useMemo(() => {
    const currentSession = domain.sessionState.sessionId
      ? domain.sessionState.liveSessions.find(
          (s) => s.id === domain.sessionState.sessionId,
        )
      : null;
    return {
      id: domain.sessionState.sessionId,
      name: currentSession?.name ?? null,
      command: currentSession?.command ?? null,
      attachMode: domain.sessionState.attachMode,
      status: presentation.statusText,
      watchers: currentSession?.watchers ?? 0,
    };
  }, [
    domain.sessionState.sessionId,
    domain.sessionState.liveSessions,
    domain.sessionState.attachMode,
    presentation.statusText,
  ]);

  return {
    appViewportRef,
    terminalElementRef: domain.connectionRuntime.terminalElementRef,
    sessionMenuRef,
    sessionButtonRef,
    sessionMenuOpen: domain.sessionState.sessionMenuOpen,
    isFullscreen: domain.uiState.isFullscreen,
    helpOpen: domain.uiState.helpOpen,
    setHelpOpen: domain.uiState.setHelpOpen,
    status: domain.connectionTransport.status,
    terminalReady: domain.connectionRuntime.terminalReady,
    statusText: presentation.statusText,
    statusAnnouncement: presentation.statusAnnouncement,
    floatingControlsModel: presentation.floatingControlsModel,
    sessionMenuModel: presentation.sessionMenuModel,
    statusBarModel: presentation.statusBarModel,
    aboutSession,
    dispatchFloatingControls: domain.dispatchFloatingControls,
    dispatchSessionMenu: domain.dispatchSessionMenu,
    dispatchStatusBar: domain.dispatchStatusBar,
  };
}
