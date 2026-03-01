import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useControllerBindings } from "../../../src/features/terminal/app/controller-bindings";
import type { ShortcutAction } from "../../../src/features/terminal/commands/shortcut-actions";
import { createNoticePublisher } from "../../../src/features/terminal/notifications/notice-publisher";
import { toUserNotice } from "../../../src/features/terminal/notifications/user-notice";
import type { Scheduler } from "../../../src/features/terminal/platform/scheduler";

const scheduler: Scheduler = {
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

describe("controller bindings", () => {
  it("wires app bindings when menu polling is disabled", () => {
    const runShortcutAction = vi.fn<(action: ShortcutAction) => void>();
    const publishSessionNotice = vi.fn();
    const publishNotice = createNoticePublisher(
      publishSessionNotice,
      toUserNotice,
    );
    const terminalElementRef = { current: document.createElement("div") };

    renderHook(() =>
      useControllerBindings({
        documentRef: document,
        windowRef: window,
        fitAndSyncSize: () => {
          // no-op
        },
        setIsFullscreen: () => {
          // no-op
        },
        sessionMenuOpen: false,
        sessionMenuRef: { current: document.createElement("div") },
        sessionButtonRef: { current: document.createElement("div") },
        closeSessionMenu: () => {
          // no-op
        },
        refreshLiveSessions: async () => ({ ok: true }),
        scheduler,
        attachMode: "control",
        sessionId: "session-a",
        status: "connected",
        terminalReady: true,
        terminalElementRef,
        runShortcutAction,
        publishNotice,
      }),
    );

    expect(document.title).toContain("LIVE");
    expect(runShortcutAction).not.toHaveBeenCalled();
    expect(publishSessionNotice).not.toHaveBeenCalled();
  });
});
