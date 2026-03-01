import { type RefObject, useCallback } from "react";
import type { FloatingControlsAction } from "../../commands/floating-controls/actions";
import type { SessionMenuAction } from "../../commands/session-menu-actions";
import type { StatusBarAction } from "../../commands/status-bar-actions";
import type { NoticePublisher } from "../../notifications/notice-contract";
import {
  useSessionMenuActions,
  useTerminalCommandActions,
} from "../controller-actions";
import { useControllerBindings } from "../controller-bindings";
import type { SessionAttachmentController } from "./session-domain-adapter";
import type { TerminalPlatformContext } from "./terminal-platform-composition";
import type { TransportRuntimeBridge } from "./transport-runtime-adapter";

export type CommandDispatchers = {
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
  applyFontSize: SessionAttachmentController["uiState"]["applyFontSize"];
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
  bridge,
}: {
  appViewportRef: RefObject<HTMLElement | null>;
  sessionMenuRef: RefObject<HTMLDivElement | null>;
  sessionButtonRef: RefObject<HTMLDivElement | null>;
  platform: TerminalPlatformContext;
  session: SessionAttachmentController;
  bridge: TransportRuntimeBridge;
}): CommandDispatchers {
  const toggleFullscreen = useFullscreenCommand({
    appViewportRef,
    documentRef: platform.documentRef,
    publishNotice: session.publishNotice,
  });

  const { dispatchSessionMenu } = useSessionMenuActions({
    lastSessionId: session.sessionState.lastSessionId,
    resetRuntimeBuffers: bridge.connectionRuntime.resetRuntimeBuffers,
    transitionSessionContext: session.sessionActions.transitionSessionContext,
    scheduleFreshConnection: bridge.connectionTransport.scheduleFreshConnection,
    reconnectNow: bridge.connectionTransport.reconnectNow,
  });

  const applyFontSize = useApplyFontSizeAction({
    applyFontSize: session.uiState.applyFontSize,
    updateFontSize: bridge.connectionRuntime.updateFontSize,
    fitAndSyncSize: bridge.connectionRuntime.fitAndSyncSize,
  });

  const {
    dispatchShortcutAction,
    dispatchFloatingControls,
    dispatchStatusBar,
  } = useTerminalCommandActions({
    applyFontSize,
    clearTerminal: bridge.connectionRuntime.clearTerminal,
    reconnectNow: bridge.connectionTransport.reconnectNow,
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
    fitAndSyncSize: bridge.connectionRuntime.fitAndSyncSize,
    setIsFullscreen: session.uiState.setIsFullscreen,
    sessionMenuOpen: session.sessionState.sessionMenuOpen,
    sessionMenuRef,
    sessionButtonRef,
    closeSessionMenu,
    refreshLiveSessions: session.sessionActions.refreshLiveSessions,
    scheduler: platform.scheduler,
    attachMode: session.sessionState.attachMode,
    sessionId: session.sessionState.sessionId,
    status: bridge.connectionTransport.status,
    terminalReady: bridge.connectionRuntime.terminalReady,
    terminalElementRef: bridge.connectionRuntime.terminalElementRef,
    runShortcutAction: dispatchShortcutAction,
    publishNotice: session.publishNotice,
  });

  return {
    dispatchFloatingControls,
    dispatchSessionMenu,
    dispatchStatusBar,
  };
}
