import { describe, expect, it } from "vitest";
import { buildTerminalPresentationModel } from "../../../../src/features/terminal/app/controller/terminal-presentation";

describe("terminal presentation model", () => {
  it("projects view models and accessibility announcement from domain state", () => {
    const presentation = buildTerminalPresentationModel({
      uiState: {
        controlsOpen: true,
        fontSize: 11,
        isFullscreen: false,
      },
      sessionState: {
        sessionMenuOpen: true,
        lastSessionId: "session-old",
        sessionNotice: "notice",
        liveSessions: [],
        sessionId: "session-a",
        sessionHistoryIds: ["session-old"],
        attachMode: "control",
      },
      connectionRuntime: {
        terminalReady: true,
      },
      connectionTransport: {
        status: "connected",
        latencyMs: 8,
        reconnectAttempt: 0,
        lastSocketFailure: null,
      },
      connectionTelemetry: {
        queuedInputBytes: 0,
        droppedInputBytes: 0,
        outputBytes: 5,
      },
    });

    expect(presentation.statusText).toBe("Connected");
    expect(presentation.statusAnnouncement).toContain("Connection status");
    expect(presentation.sessionMenuModel.canResumeLast).toBe(true);
    expect(presentation.statusBarModel.status).toBe("connected");
    expect(presentation.floatingControlsModel.terminalReady).toBe(true);
  });
});
