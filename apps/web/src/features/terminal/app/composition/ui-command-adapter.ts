import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
} from "react";
import type { FloatingControlsAction } from "../../commands/floating-controls/actions";
import type { SessionMenuAction } from "../../commands/session-menu-actions";
import type { StatusBarAction } from "../../commands/status-bar-actions";
import type { ConnectionStatus } from "../../contracts/connection";
import type { AttachMode } from "../../contracts/session/session";
import type { NoticePublisher } from "../../notifications/notice-contract";
import type {
  SessionRefreshRequest,
  SessionRefreshResult,
} from "../../session/application/session-refresh-result";
import {
  useSessionMenuActions,
  useTerminalCommandActions,
} from "../controller-actions";
import { useControllerBindings } from "../controller-bindings";
import type { TerminalPlatformContext } from "./terminal-platform-composition";

type CommandDispatchers = {
  dispatchFloatingControls: (action: FloatingControlsAction) => void;
  dispatchSessionMenu: (action: SessionMenuAction) => void;
  dispatchStatusBar: (action: StatusBarAction) => void;
};

function useFullscreenCommand({
  appViewportRef,
  documentRef,
  publishNotice,
}: {
  appViewportRef: RefObject<HTMLElement | null>;
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
  applyFontSize: (
    next: number,
    updateRuntimeFontSize: (fontSize: number, onResized: () => void) => void,
    onResized: () => void,
  ) => void;
  updateFontSize: (fontSize: number, onResized: () => void) => void;
  fitAndSyncSize: () => void;
}): (next: number) => void {
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

type UiSessionContext = {
  lastSessionId: string | null;
  attachMode: AttachMode;
  sessionId: string | null;
  sessionMenuOpen: boolean;
  readFontSize: () => number;
  applyFontSize: (
    next: number,
    updateRuntimeFontSize: (fontSize: number, onResized: () => void) => void,
    onResized: () => void,
  ) => void;
  setControlsOpen: Dispatch<SetStateAction<boolean>>;
  setIsFullscreen: Dispatch<SetStateAction<boolean>>;
  setSessionMenuOpen: Dispatch<SetStateAction<boolean>>;
  transitionSessionContext: (
    nextSessionId: string | null,
    nextMode: AttachMode,
  ) => void;
  requestSessionRefresh: (
    request: SessionRefreshRequest,
  ) => Promise<SessionRefreshResult>;
  publishNotice: NoticePublisher;
};

type UiTransportContext = {
  status: ConnectionStatus;
  terminalReady: boolean;
  terminalElementRef: RefObject<HTMLDivElement | null>;
  clearTerminal: () => void;
  updateFontSize: (fontSize: number, onResized: () => void) => void;
  fitAndSyncSize: () => void;
  resetRuntimeBuffers: () => void;
  reconnectNow: () => void;
  scheduleFreshConnection: () => void;
};

export function useUiBindingsController({
  appViewportRef,
  sessionMenuRef,
  sessionButtonRef,
  platform,
  sessionContext,
  transportContext,
}: {
  appViewportRef: RefObject<HTMLElement | null>;
  sessionMenuRef: RefObject<HTMLDivElement | null>;
  sessionButtonRef: RefObject<HTMLDivElement | null>;
  platform: TerminalPlatformContext;
  sessionContext: UiSessionContext;
  transportContext: UiTransportContext;
}): CommandDispatchers {
  const toggleFullscreen = useFullscreenCommand({
    appViewportRef,
    documentRef: platform.documentRef,
    publishNotice: sessionContext.publishNotice,
  });

  const { dispatchSessionMenu } = useSessionMenuActions({
    lastSessionId: sessionContext.lastSessionId,
    resetRuntimeBuffers: transportContext.resetRuntimeBuffers,
    transitionSessionContext: sessionContext.transitionSessionContext,
    scheduleFreshConnection: transportContext.scheduleFreshConnection,
    reconnectNow: transportContext.reconnectNow,
  });

  const applyFontSize = useApplyFontSizeAction({
    applyFontSize: sessionContext.applyFontSize,
    updateFontSize: transportContext.updateFontSize,
    fitAndSyncSize: transportContext.fitAndSyncSize,
  });

  const {
    dispatchShortcutAction,
    dispatchFloatingControls,
    dispatchStatusBar,
  } = useTerminalCommandActions({
    applyFontSize,
    clearTerminal: transportContext.clearTerminal,
    reconnectNow: transportContext.reconnectNow,
    toggleFullscreen,
    readFontSize: sessionContext.readFontSize,
    setControlsOpen: sessionContext.setControlsOpen,
    setSessionMenuOpen: sessionContext.setSessionMenuOpen,
  });

  const closeSessionMenu = useCloseSessionMenu(
    sessionContext.setSessionMenuOpen,
  );

  useControllerBindings({
    documentRef: platform.documentRef,
    windowRef: platform.windowRef,
    fitAndSyncSize: transportContext.fitAndSyncSize,
    setIsFullscreen: sessionContext.setIsFullscreen,
    sessionMenuOpen: sessionContext.sessionMenuOpen,
    sessionMenuRef,
    sessionButtonRef,
    closeSessionMenu,
    requestSessionRefresh: sessionContext.requestSessionRefresh,
    scheduler: platform.scheduler,
    attachMode: sessionContext.attachMode,
    sessionId: sessionContext.sessionId,
    status: transportContext.status,
    terminalReady: transportContext.terminalReady,
    terminalElementRef: transportContext.terminalElementRef,
    runShortcutAction: dispatchShortcutAction,
    publishNotice: sessionContext.publishNotice,
  });

  return {
    dispatchFloatingControls,
    dispatchSessionMenu,
    dispatchStatusBar,
  };
}
