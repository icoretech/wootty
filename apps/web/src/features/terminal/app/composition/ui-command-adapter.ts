import { type RefObject, useCallback } from "react";
import type { FloatingControlsAction } from "../../commands/floating-controls/actions";
import type { SessionMenuAction } from "../../commands/session-menu-actions";
import type { StatusBarAction } from "../../commands/status-bar-actions";
import type { RuntimeNoticePublisher } from "../../notifications/notice-contract";
import {
  useSessionMenuActions,
  useTerminalCommandActions,
} from "../controller-actions";
import { useControllerBindings } from "../controller-bindings";
import type { ConnectionCoordinatorState } from "../engine/connection-coordinator";
import type { TerminalPlatformContext } from "./terminal-platform-composition";
import type { TerminalSessionDomain } from "./terminal-session-domain";

type CommandDispatchers = {
  dispatchFloatingControls: (action: FloatingControlsAction) => void;
  dispatchSessionMenu: (action: SessionMenuAction) => void;
  dispatchStatusBar: (action: StatusBarAction) => void;
};

function useFullscreenCommand({
  appViewportRef,
  documentRef,
  publishRuntimeNotice,
}: {
  appViewportRef: RefObject<HTMLElement | null>;
  documentRef: Document | null;
  publishRuntimeNotice: RuntimeNoticePublisher;
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
      publishRuntimeNotice({ context: "fullscreen", cause: error });
    }
  }, [appViewportRef, documentRef, publishRuntimeNotice]);
}

function useApplyFontSizeAction({
  applyFontSize,
  updateFontSize,
  fitAndSyncSize,
}: {
  applyFontSize: TerminalSessionDomain["uiState"]["applyFontSize"];
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

export function useUiBindingsController({
  appViewportRef,
  sessionMenuRef,
  sessionButtonRef,
  platform,
  session,
  connection,
}: {
  appViewportRef: RefObject<HTMLElement | null>;
  sessionMenuRef: RefObject<HTMLDivElement | null>;
  sessionButtonRef: RefObject<HTMLDivElement | null>;
  platform: TerminalPlatformContext;
  session: TerminalSessionDomain;
  connection: ConnectionCoordinatorState;
}): CommandDispatchers {
  const toggleFullscreen = useFullscreenCommand({
    appViewportRef,
    documentRef: platform.documentRef,
    publishRuntimeNotice: session.sessionActions.publishRuntimeNoticeDetails,
  });

  const { dispatchSessionMenu } = useSessionMenuActions({
    lastSessionId: session.sessionState.lastSessionId,
    resetRuntimeBuffers: connection.runtime.resetRuntimeBuffers,
    transitionSessionContext: session.sessionActions.transitionSessionContext,
    scheduleFreshConnection: connection.transport.scheduleFreshConnection,
    reconnectNow: connection.transport.reconnectNow,
  });

  const applyFontSize = useApplyFontSizeAction({
    applyFontSize: session.uiState.applyFontSize,
    updateFontSize: connection.runtime.updateFontSize,
    fitAndSyncSize: connection.runtime.fitAndSyncSize,
  });

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

  const closeSessionMenu = useCloseSessionMenu(
    session.sessionActions.setSessionMenuOpen,
  );

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
    publishNotice: session.sessionActions.publishSessionNoticeDetails,
  });

  return {
    dispatchFloatingControls,
    dispatchSessionMenu,
    dispatchStatusBar,
  };
}
