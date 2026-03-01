import { describe, expect, it } from "vitest";
import {
  buildStatusAnnouncement,
  buildTerminalViewModels,
} from "../../../../../src/features/terminal/view/terminal-view-models";

describe("controller composition helpers", () => {
  it("builds models from grouped session and connection state", () => {
    const models = buildTerminalViewModels({
      controlsOpen: true,
      terminalReady: true,
      fontSize: 14,
      isFullscreen: false,
      sessionMenuOpen: false,
      lastSessionId: "session-last",
      sessionNotice: "",
      liveSessions: [],
      sessionId: "session-current",
      sessionHistoryIds: ["session-last"],
      attachMode: "control",
      status: "connected",
      latencyMs: 20,
      reconnectAttempt: 0,
      queuedInputBytes: 0,
      droppedInputBytes: 0,
      outputBytes: 42,
    });
    const statusAnnouncement = buildStatusAnnouncement({
      terminalReady: true,
      status: "connected",
      reconnectAttempt: 0,
      lastSocketFailure: null,
      statusText: models.statusText,
      attachMode: "control",
    });

    expect(models.statusText).toBe("Connected");
    expect(statusAnnouncement).toContain("Connection status");
  });

  it("exposes the ready bit and status through built view models", () => {
    const models = buildTerminalViewModels({
      controlsOpen: true,
      terminalReady: true,
      fontSize: 14,
      isFullscreen: false,
      sessionMenuOpen: true,
      lastSessionId: "session-last",
      sessionNotice: "notice",
      liveSessions: [],
      sessionId: "session-current",
      sessionHistoryIds: ["session-last"],
      attachMode: "control",
      status: "connected",
      latencyMs: 42,
      reconnectAttempt: 0,
      queuedInputBytes: 0,
      droppedInputBytes: 0,
      outputBytes: 10,
    });

    const connectionContext = {
      terminalReady: true,
      status: "connected",
      latencyMs: 20,
      reconnectAttempt: 0,
      queuedInputBytes: 0,
      droppedInputBytes: 0,
      outputBytes: 42,
      lastSocketFailure: null,
    };
    expect(models.statusBarModel.status).toBe(connectionContext.status);
    expect(models.floatingControlsModel.terminalReady).toBe(true);
  });
});
