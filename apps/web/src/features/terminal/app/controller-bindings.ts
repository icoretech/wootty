import { type RefObject, useCallback } from "react";
import type { ShortcutAction } from "../commands/shortcut-actions";
import type { ConnectionStatus } from "../contracts/connection";
import type { NoticePublisher } from "../contracts/notice";
import type { AttachMode } from "../contracts/session";
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
  documentRef: Document | null;
  windowRef: Window | null;
  fitAndSyncSize: () => void;
  setIsFullscreen: (value: boolean) => void;
  sessionMenuOpen: boolean;
  sessionMenuRef: RefObject<HTMLDivElement | null>;
  sessionButtonRef: RefObject<HTMLDivElement | null>;
  closeSessionMenu: () => void;
  refreshLiveSessions: (
    request: SessionRefreshRequest,
  ) => Promise<SessionRefreshResult>;
  scheduler: Scheduler;
  attachMode: AttachMode;
  sessionId: string | null;
  status: ConnectionStatus;
  terminalReady: boolean;
  terminalElementRef: RefObject<HTMLDivElement | null>;
  runShortcutAction: (action: ShortcutAction) => void;
  publishNotice: NoticePublisher;
};

export function useControllerBindings({
  documentRef,
  windowRef,
  fitAndSyncSize,
  setIsFullscreen,
  sessionMenuOpen,
  sessionMenuRef,
  sessionButtonRef,
  closeSessionMenu,
  refreshLiveSessions,
  scheduler,
  attachMode,
  sessionId,
  status,
  terminalReady,
  terminalElementRef,
  runShortcutAction,
  publishNotice,
}: UseControllerBindingsArgs): void {
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
    refreshLiveSessions,
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
