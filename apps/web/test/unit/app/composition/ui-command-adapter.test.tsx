import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import type { TerminalPlatformContext } from "../../../../src/features/terminal/app/composition/terminal-platform-composition";
import { useUiBindingsController } from "../../../../src/features/terminal/app/composition/ui-command-adapter";

const dispatchSessionMenu = vi.fn();
const dispatchFloatingControls = vi.fn();
const dispatchStatusBar = vi.fn();
const dispatchShortcutAction = vi.fn();
const useSessionMenuActionsMock = vi.fn(() => ({ dispatchSessionMenu }));
const useTerminalCommandActionsMock = vi.fn(() => ({
  dispatchShortcutAction,
  dispatchFloatingControls,
  dispatchStatusBar,
}));
const useControllerBindingsMock = vi.fn();

vi.mock("../../../../src/features/terminal/app/controller-actions", () => ({
  useSessionMenuActions: (args: unknown) => {
    return useSessionMenuActionsMock(args);
  },
  useTerminalCommandActions: (args: unknown) => {
    return useTerminalCommandActionsMock(args);
  },
}));

vi.mock("../../../../src/features/terminal/app/controller-bindings", () => ({
  useControllerBindings: (args: unknown) => {
    useControllerBindingsMock(args);
  },
}));

function createSessionContext() {
  return {
    lastSessionId: "s-1",
    attachMode: "control" as const,
    sessionId: "s-1",
    sessionMenuOpen: true,
    readFontSize: () => 14,
    applyFontSize: vi.fn(),
    setControlsOpen: vi.fn(),
    setIsFullscreen: vi.fn(),
    setSessionMenuOpen: vi.fn(),
    transitionSessionContext: vi.fn(),
    requestSessionRefresh: vi.fn(async (_request: unknown) => ({ ok: true })),
    publishNotice: vi.fn(),
  };
}

function createTransportContext() {
  return {
    status: "connecting" as const,
    terminalReady: false,
    terminalElementRef: { current: null },
    clearTerminal: vi.fn(),
    updateFontSize: vi.fn(),
    fitAndSyncSize: vi.fn(),
    resetRuntimeBuffers: vi.fn(),
    reconnectNow: vi.fn(),
    scheduleFreshConnection: vi.fn(),
  };
}

describe("ui command adapter", () => {
  it("wires session/connection state into command and binding hooks", () => {
    useSessionMenuActionsMock.mockClear();
    useTerminalCommandActionsMock.mockClear();
    useControllerBindingsMock.mockClear();

    const platform: TerminalPlatformContext = {
      windowRef: window,
      documentRef: document,
      scheduler: {
        now: () => 0,
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
        setInterval: vi.fn(),
        clearInterval: vi.fn(),
      },
      backendResolution: {
        ok: true,
        endpoints: {
          sessionsHttpUrl: "/api/sessions",
          terminalWsUrl: "ws://127.0.0.1/api/terminal",
        },
      },
      fetchSessions: vi.fn(async () => ({ ok: true, payload: {} })),
    };
    const sessionContext = createSessionContext();
    const transportContext = createTransportContext();

    const { result } = renderHook(() => {
      return useUiBindingsController({
        appViewportRef: createRef<HTMLElement>(),
        sessionMenuRef: createRef<HTMLDivElement>(),
        sessionButtonRef: createRef<HTMLDivElement>(),
        platform,
        sessionContext,
        transportContext,
      });
    });

    expect(useSessionMenuActionsMock).toHaveBeenCalledTimes(1);
    expect(useTerminalCommandActionsMock).toHaveBeenCalledTimes(1);
    expect(useControllerBindingsMock).toHaveBeenCalledTimes(1);
    expect(result.current.dispatchSessionMenu).toBe(dispatchSessionMenu);
    expect(result.current.dispatchFloatingControls).toBe(
      dispatchFloatingControls,
    );
    expect(result.current.dispatchStatusBar).toBe(dispatchStatusBar);
  });
});
