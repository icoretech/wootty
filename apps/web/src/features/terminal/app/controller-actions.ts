import { type Dispatch, type SetStateAction, useCallback } from "react";
import { isRuntimeCommand } from "../commands/command-registry";
import type { FloatingControlsAction } from "../commands/floating-controls/actions";
import {
  TERMINAL_RUNTIME_COMMAND,
  type TerminalRuntimeCommand,
} from "../commands/runtime-commands";
import type { SessionMenuAction } from "../commands/session-menu-actions";
import type { ShortcutAction } from "../commands/shortcut-actions";
import type { StatusBarAction } from "../commands/status-bar-actions";
import {
  VIEWPORT_UI_COMMAND,
  type ViewportUiCommand,
} from "../commands/viewport-commands";
import type { AttachMode } from "../contracts/session/session";
import { assertNever } from "../lib/assert-never";
import { DEFAULT_FONT_SIZE } from "./preferences/font-size-preferences";

type UseSessionMenuActionsArgs = {
  lastSessionId: string | null;
  resetRuntimeBuffers: () => void;
  transitionSessionContext: (
    nextSessionId: string | null,
    nextMode: AttachMode,
  ) => void;
  scheduleFreshConnection: () => void;
  reconnectNow: () => void;
};

export function useSessionMenuActions({
  lastSessionId,
  resetRuntimeBuffers,
  transitionSessionContext,
  scheduleFreshConnection,
  reconnectNow,
}: UseSessionMenuActionsArgs): {
  dispatchSessionMenu: (action: SessionMenuAction) => void;
} {
  const startFreshSession = useCallback(() => {
    resetRuntimeBuffers();
    transitionSessionContext(null, "control");
    scheduleFreshConnection();
  }, [resetRuntimeBuffers, scheduleFreshConnection, transitionSessionContext]);

  const attachToSession = useCallback(
    (targetSessionId: string, mode: AttachMode = "control") => {
      if (!targetSessionId) {
        return;
      }
      resetRuntimeBuffers();
      transitionSessionContext(targetSessionId, mode);
      reconnectNow();
    },
    [reconnectNow, resetRuntimeBuffers, transitionSessionContext],
  );

  const resumePreviousSession = useCallback(() => {
    if (!lastSessionId) {
      return;
    }
    attachToSession(lastSessionId, "control");
  }, [attachToSession, lastSessionId]);

  const dispatchSessionMenu = useCallback(
    (action: SessionMenuAction) => {
      switch (action.type) {
        case "startFresh":
          startFreshSession();
          return;
        case "resumeLast":
          resumePreviousSession();
          return;
        case "attach":
          attachToSession(action.sessionId, action.mode);
          return;
        default:
          assertNever(action);
      }
    },
    [attachToSession, resumePreviousSession, startFreshSession],
  );

  return {
    dispatchSessionMenu,
  };
}

type UseTerminalCommandActionsArgs = {
  applyFontSize: (next: number) => void;
  clearTerminal: () => void;
  reconnectNow: () => void;
  toggleFullscreen: () => Promise<void>;
  readFontSize: () => number;
  setControlsOpen: Dispatch<SetStateAction<boolean>>;
  setSessionMenuOpen: Dispatch<SetStateAction<boolean>>;
};

export function useTerminalCommandActions({
  applyFontSize,
  clearTerminal,
  reconnectNow,
  toggleFullscreen,
  readFontSize,
  setControlsOpen,
  setSessionMenuOpen,
}: UseTerminalCommandActionsArgs): {
  dispatchShortcutAction: (action: ShortcutAction) => void;
  dispatchFloatingControls: (action: FloatingControlsAction) => void;
  dispatchStatusBar: (action: StatusBarAction) => void;
} {
  const runRuntimeCommand = useCallback(
    (command: TerminalRuntimeCommand) => {
      switch (command) {
        case TERMINAL_RUNTIME_COMMAND.RECONNECT:
          reconnectNow();
          return;
        case TERMINAL_RUNTIME_COMMAND.CLEAR:
          clearTerminal();
          return;
        default:
          assertNever(command);
      }
    },
    [clearTerminal, reconnectNow],
  );

  const runViewportCommand = useCallback(
    (command: ViewportUiCommand) => {
      switch (command) {
        case VIEWPORT_UI_COMMAND.DECREASE_FONT:
          applyFontSize(readFontSize() - 1);
          return;
        case VIEWPORT_UI_COMMAND.INCREASE_FONT:
          applyFontSize(readFontSize() + 1);
          return;
        case VIEWPORT_UI_COMMAND.RESET_FONT:
          applyFontSize(DEFAULT_FONT_SIZE);
          return;
        case VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN:
          void toggleFullscreen();
          return;
        case VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS:
          setControlsOpen((previous) => !previous);
          return;
        default:
          assertNever(command);
      }
    },
    [applyFontSize, readFontSize, setControlsOpen, toggleFullscreen],
  );

  const dispatchFloatingControls = useCallback(
    (action: FloatingControlsAction) => {
      if (isRuntimeCommand(action.type)) {
        runRuntimeCommand(action.type);
        return;
      }
      runViewportCommand(action.type);
    },
    [runRuntimeCommand, runViewportCommand],
  );

  const dispatchShortcutAction = useCallback(
    (action: ShortcutAction) => {
      if (isRuntimeCommand(action)) {
        runRuntimeCommand(action);
        return;
      }
      runViewportCommand(action);
    },
    [runRuntimeCommand, runViewportCommand],
  );

  const dispatchStatusBar = useCallback(
    (action: StatusBarAction) => {
      switch (action.type) {
        case VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS:
          runViewportCommand(VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS);
          return;
        case "toggleSessionMenu":
          setSessionMenuOpen((previous) => !previous);
          return;
        default:
          assertNever(action);
      }
    },
    [runViewportCommand, setSessionMenuOpen],
  );

  return {
    dispatchShortcutAction,
    dispatchFloatingControls,
    dispatchStatusBar,
  };
}
