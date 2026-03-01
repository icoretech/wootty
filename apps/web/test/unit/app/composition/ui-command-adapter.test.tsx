import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import type { TerminalPlatformContext } from "../../../../src/features/terminal/app/composition/terminal-platform-composition";
import type { TerminalSessionDomain } from "../../../../src/features/terminal/app/composition/terminal-session-domain";
import { useUiBindingsController } from "../../../../src/features/terminal/app/composition/ui-command-adapter";
import type { ConnectionCoordinatorState } from "../../../../src/features/terminal/app/engine/connection-coordinator";

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

function createSessionDomain(): TerminalSessionDomain {
  return {
    uiState: {
      initialFontSize: 14,
      fontSize: 14,
      controlsOpen: true,
      isFullscreen: false,
      setControlsOpen: vi.fn(),
      setIsFullscreen: vi.fn(),
      readFontSize: () => 14,
      applyFontSize: vi.fn(),
    },
    sessionState: {
      sessionId: "s-1",
      lastSessionId: "s-1",
      sessionHistoryIds: ["s-1"],
      liveSessions: [],
      sessionNotice: "",
      attachMode: "control",
      sessionMenuOpen: true,
      hasActiveSession: true,
    },
    sessionActions: {
      setSessionMenuOpen: vi.fn(),
      publishNoticeDetails: vi.fn(),
      publishSessionNotice: vi.fn(),
      clearSessionNotice: vi.fn(),
      reportStorageFailure: vi.fn(),
      setSessionMode: vi.fn(),
      requestSessionRefresh: vi.fn(async () => ({ ok: true })),
      requestTransportRefresh: vi.fn(async () => ({ ok: true })),
      applyReadySession: vi.fn(),
      clearMissingSession: vi.fn(),
      transitionSessionContext: vi.fn(),
    },
    wsUrl: "ws://127.0.0.1/api/terminal",
  };
}

function createConnectionState(): ConnectionCoordinatorState {
  return {
    runtime: {
      terminalElementRef: { current: null },
      terminalReady: false,
      clearTerminal: vi.fn(),
      updateFontSize: vi.fn(),
      fitAndSyncSize: vi.fn(),
      resetRuntimeBuffers: vi.fn(),
    },
    transport: {
      status: "connecting",
      reconnectAttempt: 0,
      latencyMs: null,
      lastSocketFailure: null,
      reconnectNow: vi.fn(),
      scheduleFreshConnection: vi.fn(),
    },
    telemetry: {
      outputBytes: 0,
      queuedInputBytes: 0,
      droppedInputBytes: 0,
    },
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
    const session = createSessionDomain();
    const connection = createConnectionState();

    const { result } = renderHook(() => {
      return useUiBindingsController({
        appViewportRef: createRef<HTMLElement>(),
        sessionMenuRef: createRef<HTMLDivElement>(),
        sessionButtonRef: createRef<HTMLDivElement>(),
        platform,
        session,
        connection,
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
