import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  useSessionMenuActions,
  useTerminalCommandActions,
} from "../../../../../src/features/terminal/app/controller-actions";
import { TERMINAL_RUNTIME_COMMAND } from "../../../../../src/features/terminal/commands/runtime-commands";
import { VIEWPORT_UI_COMMAND } from "../../../../../src/features/terminal/commands/viewport-commands";

describe("controller actions", () => {
  it("dispatches terminal commands for floating controls and status bar", async () => {
    const applyFontSize = vi.fn();
    const clearTerminal = vi.fn();
    const reconnectNow = vi.fn();
    const toggleFullscreen = vi.fn(async () => {});
    const downloadVisibleTranscript = vi.fn();
    const setControlsOpen = vi.fn();
    const setSessionMenuOpen = vi.fn();
    const setHelpOpen = vi.fn();
    const sendNow = vi.fn(() => true);
    const requestSessionRefresh = vi.fn();

    const { result } = renderHook(() => {
      return useTerminalCommandActions({
        applyFontSize,
        clearTerminal,
        reconnectNow,
        toggleFullscreen,
        readFontSize: () => 12,
        setControlsOpen,
        setSessionMenuOpen,
        setHelpOpen,
        sendNow,
        downloadVisibleTranscript,
        requestSessionRefresh,
      });
    });

    act(() => {
      result.current.dispatchFloatingControls({
        type: TERMINAL_RUNTIME_COMMAND.CLEAR,
      });
      result.current.dispatchFloatingControls({
        type: TERMINAL_RUNTIME_COMMAND.RECONNECT,
      });
      result.current.dispatchStatusBar({
        type: VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS,
      });
      result.current.dispatchStatusBar({ type: "toggleSessionMenu" });
      result.current.dispatchStatusBar({ type: "downloadTranscript" });
      result.current.dispatchShortcutAction(VIEWPORT_UI_COMMAND.RESET_FONT);
    });

    expect(clearTerminal).toHaveBeenCalledTimes(1);
    expect(reconnectNow).toHaveBeenCalledTimes(1);
    expect(setControlsOpen).toHaveBeenCalledTimes(1);
    expect(setSessionMenuOpen).toHaveBeenCalledTimes(1);
    expect(downloadVisibleTranscript).toHaveBeenCalledTimes(1);
    expect(applyFontSize).toHaveBeenCalledWith(11);
  });

  it("dispatches session menu flows with explicit session transitions", () => {
    const resetRuntimeBuffers = vi.fn();
    const transitionSessionContext = vi.fn();
    const scheduleFreshConnection = vi.fn();
    const reconnectNow = vi.fn();

    const { result } = renderHook(() => {
      return useSessionMenuActions({
        lastSessionId: "session-last",
        resetRuntimeBuffers,
        transitionSessionContext,
        scheduleFreshConnection,
        reconnectNow,
      });
    });

    act(() => {
      result.current.dispatchSessionMenu({ type: "startFresh" });
      result.current.dispatchSessionMenu({ type: "resumeLast" });
      result.current.dispatchSessionMenu({
        type: "attach",
        sessionId: "session-live",
        mode: "watch",
      });
    });

    expect(resetRuntimeBuffers).toHaveBeenCalledTimes(3);
    expect(scheduleFreshConnection).toHaveBeenCalledTimes(1);
    expect(reconnectNow).toHaveBeenCalledTimes(2);
    expect(transitionSessionContext).toHaveBeenNthCalledWith(
      1,
      null,
      "control",
    );
    expect(transitionSessionContext).toHaveBeenNthCalledWith(
      2,
      "session-last",
      "control",
    );
    expect(transitionSessionContext).toHaveBeenNthCalledWith(
      3,
      "session-live",
      "watch",
    );
  });
});
