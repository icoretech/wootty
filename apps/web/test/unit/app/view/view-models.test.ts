import { describe, expect, it } from "vitest";
import {
  buildStatusAnnouncement,
  buildTerminalViewModels,
} from "../../../../src/features/terminal/view/terminal-view-models";

describe("terminal view-model mappers", () => {
  it("builds control, session, and status models from app state", () => {
    const models = buildTerminalViewModels({
      controlsOpen: true,
      terminalReady: true,
      fontSize: 13,
      isFullscreen: false,
      sessionMenuOpen: true,
      lastSessionId: "session-last",
      sessionNotice: "updated",
      liveSessions: [],
      sessionId: "session-current",
      sessionHistoryIds: ["session-old"],
      status: "connected",
      latencyMs: 22,
      attachMode: "control",
      reconnectAttempt: 0,
      queuedInputBytes: 128,
      droppedInputBytes: 64,
      outputBytes: 1024,
    });

    expect(models.statusText).toBe("Connected");
    expect(models.floatingControlsModel.fontSize).toBe(13);
    expect(models.sessionMenuModel.sessionNotice).toBe("updated");
    expect(models.statusBarModel.latencyText).toBe("22ms");
    expect(models.statusBarModel.queuedInputText).toBe("128 B");
  });

  it("builds status announcements per runtime and transport state", () => {
    expect(
      buildStatusAnnouncement({
        terminalReady: false,
        status: "connecting",
        reconnectAttempt: 0,
        lastSocketFailure: "",
        statusText: "Connecting",
        attachMode: "control",
      }),
    ).toBe("Loading terminal runtime.");

    expect(
      buildStatusAnnouncement({
        terminalReady: true,
        status: "reconnecting",
        reconnectAttempt: 2,
        lastSocketFailure: "close code=1006",
        statusText: "Reconnecting",
        attachMode: "watch",
      }),
    ).toContain("Attempt 2");
  });
});
