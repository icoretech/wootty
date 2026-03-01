import { type RefObject, useCallback } from "react";
import type { ShortcutAction } from "../commands/shortcut-actions";
import type { ConnectionStatus } from "../contracts/connection";
import type { AttachMode } from "../contracts/session/session";
import type { SessionNoticePublisher } from "../notifications/notice-contract";
import type { Scheduler } from "../platform/scheduler";
import { useSessionRefreshBinding } from "../session/application/bindings/session-refresh-binding";
import type {
  SessionRefreshRequest,
  SessionRefreshResult,
} from "../session/application/session-refresh-result";
import {
  useDocumentTitleBinding,
  useSessionMenuDismissBinding,
} from "./bindings/document-bindings";
import { useShortcutBinding } from "./bindings/shortcut-binding";
import {
  useFullscreenBinding,
  useTerminalResizeBinding,
} from "./bindings/window-bindings";

type UseControllerBindingsArgs = {
  platform: {
    documentRef: Document | null;
    windowRef: Window | null;
    scheduler: Scheduler;
  };
  session: {
    sessionMenuOpen: boolean;
    sessionMenuRef: RefObject<HTMLDivElement | null>;
    sessionButtonRef: RefObject<HTMLDivElement | null>;
    closeSessionMenu: () => void;
    requestSessionRefresh: (
      request: SessionRefreshRequest,
    ) => Promise<SessionRefreshResult>;
    attachMode: AttachMode;
    sessionId: string | null;
    publishNotice: SessionNoticePublisher;
  };
  terminal: {
    fitAndSyncSize: () => void;
    setIsFullscreen: (value: boolean) => void;
    status: ConnectionStatus;
    terminalReady: boolean;
    terminalElementRef: RefObject<HTMLDivElement | null>;
    runShortcutAction: (action: ShortcutAction) => void;
  };
};

export function useControllerBindings({
  platform,
  session,
  terminal,
}: UseControllerBindingsArgs): void {
  const { documentRef, windowRef, scheduler } = platform;
  const {
    sessionMenuOpen,
    sessionMenuRef,
    sessionButtonRef,
    closeSessionMenu,
    requestSessionRefresh,
    attachMode,
    sessionId,
    publishNotice,
  } = session;
  const {
    fitAndSyncSize,
    setIsFullscreen,
    status,
    terminalReady,
    terminalElementRef,
    runShortcutAction,
  } = terminal;

  const handleRefreshCircuitOpen = useCallback(
    (consecutiveFailures: number) => {
      publishNotice({
        context: "sessions_refresh",
        reason: "refresh_paused_after_failures",
        count: consecutiveFailures,
      });
    },
    [publishNotice],
  );

  useFullscreenBinding({
    documentRef,
    windowRef,
    scheduler,
    fitAndSyncSize,
    setIsFullscreen,
  });

  useSessionMenuDismissBinding({
    documentRef,
    sessionMenuOpen,
    sessionMenuRef,
    sessionButtonRef,
    closeSessionMenu,
  });

  useSessionRefreshBinding({
    sessionMenuOpen,
    windowRef,
    requestSessionRefresh,
    scheduler,
    onRefreshCircuitOpen: handleRefreshCircuitOpen,
  });

  useDocumentTitleBinding({
    documentRef,
    attachMode,
    sessionId,
    status,
  });

  useTerminalResizeBinding({
    documentRef,
    windowRef,
    terminalReady,
    terminalElementRef,
    fitAndSyncSize,
  });

  useShortcutBinding({
    windowRef,
    terminalReady,
    runShortcutAction,
  });
}
