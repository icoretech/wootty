import { fireEvent, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  useDocumentTitleBinding,
  useSessionMenuDismissBinding,
} from "../../../../../src/features/terminal/app/bindings/document-bindings";
import { useShortcutBinding } from "../../../../../src/features/terminal/app/bindings/shortcut-binding";
import {
  useFullscreenBinding,
  useTerminalResizeBinding,
} from "../../../../../src/features/terminal/app/bindings/window-bindings";
import type { ShortcutAction } from "../../../../../src/features/terminal/commands/shortcut-actions";
import type {
  ScheduledTask,
  Scheduler,
  SchedulerTimerHandle,
} from "../../../../../src/features/terminal/platform/scheduler";
import { useSessionRefreshBinding } from "../../../../../src/features/terminal/session/application/bindings/session-refresh-binding";

const terminalRef: RefObject<HTMLDivElement | null> = { current: null };
const menuRef: RefObject<HTMLDivElement | null> = { current: null };
const buttonRef: RefObject<HTMLDivElement | null> = { current: null };

function runNoopSync(): void {
  // Accessing time keeps the callback side-effect free but non-empty.
  void Date.now();
}

async function runNoopAsync(): Promise<{ ok: true }> {
  await Promise.resolve();
  return { ok: true };
}

function runNoopShortcut(_action: ShortcutAction): void {
  // Accessing time keeps the callback side-effect free but non-empty.
  void Date.now();
}

const noopScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (task, delayMs) => window.setTimeout(task, delayMs),
  clearTimeout: (timerId) => {
    window.clearTimeout(timerId);
  },
  setInterval: (task, intervalMs) => window.setInterval(task, intervalMs),
  clearInterval: (timerId) => {
    window.clearInterval(timerId);
  },
};

function useBindingsProbe(): void {
  useFullscreenBinding({
    documentRef: null,
    windowRef: null,
    scheduler: noopScheduler,
    fitAndSyncSize: runNoopSync,
    setIsFullscreen: runNoopSync,
  });
  useSessionMenuDismissBinding({
    documentRef: null,
    sessionMenuOpen: true,
    sessionMenuRef: menuRef,
    sessionButtonRef: buttonRef,
    closeSessionMenu: runNoopSync,
  });
  useSessionRefreshBinding({
    sessionMenuOpen: false,
    windowRef: null,
    requestSessionRefresh: runNoopAsync,
    scheduler: noopScheduler,
  });
  useDocumentTitleBinding({
    documentRef: document,
    attachMode: "control",
    sessionId: "session-a",
    status: "connected",
  });
  useTerminalResizeBinding({
    documentRef: null,
    windowRef: null,
    terminalReady: true,
    terminalElementRef: terminalRef,
    fitAndSyncSize: runNoopSync,
  });
  useShortcutBinding({
    windowRef: null,
    terminalReady: false,
    runShortcutAction: runNoopShortcut,
  });
}

describe("ui bindings", () => {
  it("mounts all binding hooks and updates the document title", () => {
    renderHook(() => {
      useBindingsProbe();
    });
    expect(document.title).toContain("LIVE");
    expect(document.title).toContain("session-a");
  });

  it("skips global shortcuts when focus is inside an editable target", () => {
    const runShortcutAction = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    const { unmount } = renderHook(() =>
      useShortcutBinding({
        windowRef: window,
        terminalReady: true,
        runShortcutAction,
      }),
    );

    fireEvent.keyDown(input, {
      code: "KeyK",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(runShortcutAction).not.toHaveBeenCalled();
    unmount();
    input.remove();
  });

  it("dismisses the session menu on outside pointer interactions", () => {
    const closeSessionMenu = vi.fn();
    const menuElement = document.createElement("div");
    const buttonElement = document.createElement("div");
    const outsideElement = document.createElement("button");
    document.body.appendChild(menuElement);
    document.body.appendChild(buttonElement);
    document.body.appendChild(outsideElement);

    const sessionMenuRef: RefObject<HTMLDivElement | null> = {
      current: menuElement,
    };
    const sessionButtonRef: RefObject<HTMLDivElement | null> = {
      current: buttonElement,
    };

    const { unmount } = renderHook(() =>
      useSessionMenuDismissBinding({
        documentRef: document,
        sessionMenuOpen: true,
        sessionMenuRef,
        sessionButtonRef,
        closeSessionMenu,
      }),
    );

    fireEvent.pointerDown(menuElement);
    fireEvent.pointerDown(buttonElement);
    expect(closeSessionMenu).not.toHaveBeenCalled();

    fireEvent.pointerDown(outsideElement);
    expect(closeSessionMenu).toHaveBeenCalledTimes(1);

    unmount();
    menuElement.remove();
    buttonElement.remove();
    outsideElement.remove();
  });

  it("clears pending fullscreen resize timer on unmount", () => {
    const setTimeoutSpy = vi
      .fn<(task: ScheduledTask, delayMs: number) => SchedulerTimerHandle>()
      .mockReturnValue(123);
    const clearTimeoutSpy = vi.fn<(id: SchedulerTimerHandle) => void>();
    const scheduler: Scheduler = {
      now: () => 0,
      setTimeout: setTimeoutSpy,
      clearTimeout: clearTimeoutSpy,
      setInterval:
        vi.fn<
          (task: ScheduledTask, intervalMs: number) => SchedulerTimerHandle
        >(),
      clearInterval: vi.fn<(id: SchedulerTimerHandle) => void>(),
    };
    const fitAndSyncSize = vi.fn();
    const setIsFullscreen = vi.fn();

    const { unmount } = renderHook(() =>
      useFullscreenBinding({
        documentRef: document,
        windowRef: window,
        scheduler,
        fitAndSyncSize,
        setIsFullscreen,
      }),
    );

    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 40);

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(123);
  });
});
