import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useControllerBindings } from "../../../../src/features/terminal/app/controller-bindings";
import type { ShortcutAction } from "../../../../src/features/terminal/commands/shortcut-actions";
import type { NoticeDetails } from "../../../../src/features/terminal/notifications/notice-contract";
import { toUserNotice } from "../../../../src/features/terminal/notifications/user-notice";
import type { Scheduler } from "../../../../src/features/terminal/platform/scheduler";

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
    const publishNotice = (details: NoticeDetails) => {
      publishSessionNotice(toUserNotice(details));
    };
    const terminalElementRef = { current: document.createElement("div") };

    renderHook(() =>
      useControllerBindings({
        platform: {
          documentRef: document,
          windowRef: window,
          scheduler,
        },
        session: {
          sessionMenuOpen: false,
          sessionMenuRef: { current: document.createElement("div") },
          sessionButtonRef: { current: document.createElement("div") },
          closeSessionMenu: () => {
            // no-op
          },
          requestSessionRefresh: async () => ({ ok: true }),
          attachMode: "control",
          sessionId: "session-a",
          publishNotice,
        },
        terminal: {
          fitAndSyncSize: () => {
            // no-op
          },
          setIsFullscreen: () => {
            // no-op
          },
          status: "connected",
          terminalReady: true,
          terminalElementRef,
          runShortcutAction,
        },
      }),
    );

    expect(document.title).toContain("LIVE");
    expect(runShortcutAction).not.toHaveBeenCalled();
    expect(publishSessionNotice).not.toHaveBeenCalled();
  });
});
