import { describe, expect, it } from "vitest";
import type { FloatingControlsAction } from "../../../../src/features/terminal/commands/floating-controls/actions";
import type { SessionMenuAction } from "../../../../src/features/terminal/commands/session-menu-actions";
import type { StatusBarAction } from "../../../../src/features/terminal/commands/status-bar-actions";
import type { FloatingControlsModel } from "../../../../src/features/terminal/view/floating-controls-model";
import type { SessionMenuModel } from "../../../../src/features/terminal/view/session-menu-model";
import type { StatusBarModel } from "../../../../src/features/terminal/view/status-bar-model";

describe("view contracts", () => {
  it("defines stable floating/session/status action unions", () => {
    const floating: FloatingControlsAction[] = [
      { type: "reconnect" },
      { type: "clear" },
      { type: "decreaseFont" },
      { type: "increaseFont" },
      { type: "resetFont" },
      { type: "toggleFullscreen" },
    ];
    const session: SessionMenuAction[] = [
      { type: "startFresh" },
      { type: "resumeLast" },
      { type: "attach", sessionId: "session-a", mode: "control" },
      { type: "attach", sessionId: "session-b", mode: "watch" },
    ];
    const status: StatusBarAction[] = [
      { type: "toggleControls" },
      { type: "toggleSessionMenu" },
      { type: "downloadTranscript" },
    ];

    expect(floating).toHaveLength(6);
    expect(session).toHaveLength(4);
    expect(status).toHaveLength(3);
  });

  it("exposes model structures required by the terminal view", () => {
    const floatingModel: FloatingControlsModel = {
      controlsOpen: true,
      terminalReady: true,
      fontSize: 12,
      fontSizeMin: 10,
      fontSizeMax: 24,
      defaultFontSize: 11,
      isFullscreen: false,
    };
    const sessionModel: SessionMenuModel = {
      sessionMenuOpen: true,
      terminalReady: true,
      canResumeLast: true,
      sessionNotice: "",
      liveRows: [],
      historyRows: [],
    };
    const statusModel: StatusBarModel = {
      controlsOpen: true,
      sessionMenuOpen: false,
      status: "connected",
      latencyTone: "good",
      statusText: "Connected",
      latencyText: "25ms",
      sessionName: "session-a-full",
      sessionDisplay: "session-a",
      attachMode: "control",
      reconnectAttempt: 0,
      queuedInputText: "0 B",
      droppedInputText: "0 B",
      canDownloadTranscript: false,
      outputText: "0 B",
      outputBytes: 0,
    };

    expect(floatingModel.terminalReady).toBe(true);
    expect(sessionModel.liveRows).toHaveLength(0);
    expect(statusModel.status).toBe("connected");
  });
});
