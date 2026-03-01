import type { FloatingControlsModel } from "../components/models/floating-controls-model";
import type { SessionMenuModel } from "../components/models/session-menu-model";
import type { StatusBarModel } from "../components/models/status-bar-model";
import type { ConnectionStatus } from "../contracts/connection";
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
} from "../contracts/font-size";
import type { AttachMode, SessionSnapshot } from "../contracts/session";
import { formatBytes, formatLatency } from "../lib/terminal-format";
import { buildFloatingControlDescriptors } from "../presentation/command-ui/floating-control-descriptors";
import {
  ageLabel,
  latencyTone,
  shortSessionId,
  statusLabel,
} from "../presentation/formatters";
import { presentSessionCandidate } from "../presentation/session-menu-presenter";
import { deriveSessionCandidates } from "../session/domain/session-contract";

type TerminalViewModelInput = {
  controlsOpen: boolean;
  terminalReady: boolean;
  fontSize: number;
  isFullscreen: boolean;
  sessionMenuOpen: boolean;
  lastSessionId: string | null;
  sessionNotice: string;
  liveSessions: SessionSnapshot[];
  sessionId: string | null;
  sessionHistoryIds: string[];
  status: ConnectionStatus;
  latencyMs: number | null;
  attachMode: AttachMode;
  reconnectAttempt: number;
  queuedInputBytes: number;
  droppedInputBytes: number;
  outputBytes: number;
};

type TerminalViewModels = {
  statusText: string;
  floatingControlsModel: FloatingControlsModel;
  sessionMenuModel: SessionMenuModel;
  statusBarModel: StatusBarModel;
};

export function buildTerminalViewModels(
  input: TerminalViewModelInput,
): TerminalViewModels {
  const statusText = statusLabel(input.status);
  const sessionDisplay = input.sessionId
    ? shortSessionId(input.sessionId)
    : "pending";
  const { liveSessionCandidates, historySessionCandidates } =
    deriveSessionCandidates({
      liveSessions: input.liveSessions,
      currentSessionId: input.sessionId,
      sessionHistoryIds: input.sessionHistoryIds,
      lastSessionId: input.lastSessionId,
    });

  const sessionMenuLiveRows = liveSessionCandidates.map((candidate) => {
    const row = presentSessionCandidate(candidate, ageLabel);
    return {
      id: row.id,
      mode: row.mode,
      primaryText: shortSessionId(row.id),
      secondaryText: row.secondaryText,
      actionLabel: row.actionLabel,
    };
  });
  const sessionMenuHistoryRows = historySessionCandidates.map((historyId) => ({
    id: historyId,
    primaryText: shortSessionId(historyId),
  }));

  const floatingControlsModel: FloatingControlsModel = {
    controlsOpen: input.controlsOpen,
    terminalReady: input.terminalReady,
    fontSize: input.fontSize,
    fontSizeMin: FONT_SIZE_MIN,
    fontSizeMax: FONT_SIZE_MAX,
    defaultFontSize: DEFAULT_FONT_SIZE,
    isFullscreen: input.isFullscreen,
    metadata: buildFloatingControlDescriptors(),
  };

  const sessionMenuModel: SessionMenuModel = {
    sessionMenuOpen: input.sessionMenuOpen,
    terminalReady: input.terminalReady,
    canResumeLast: input.lastSessionId !== null,
    sessionNotice: input.sessionNotice,
    liveRows: sessionMenuLiveRows,
    historyRows: sessionMenuHistoryRows,
  };

  const tone = latencyTone(input.status, input.latencyMs);
  const statusBarModel: StatusBarModel = {
    controlsOpen: input.controlsOpen,
    sessionMenuOpen: input.sessionMenuOpen,
    status: input.status,
    latencyTone: tone,
    statusText,
    latencyText: formatLatency(input.latencyMs),
    sessionDisplay,
    attachMode: input.attachMode,
    reconnectAttempt: input.reconnectAttempt,
    queuedInputText: formatBytes(input.queuedInputBytes),
    droppedInputText: formatBytes(input.droppedInputBytes),
    outputText: formatBytes(input.outputBytes),
    outputBytes: input.outputBytes,
  };

  return {
    statusText,
    floatingControlsModel,
    sessionMenuModel,
    statusBarModel,
  };
}

export function buildStatusAnnouncement({
  terminalReady,
  status,
  reconnectAttempt,
  lastSocketFailure,
  statusText,
  attachMode,
}: {
  terminalReady: boolean;
  status: ConnectionStatus;
  reconnectAttempt: number;
  lastSocketFailure: string;
  statusText: string;
  attachMode: AttachMode;
}): string {
  const modeLabel = attachMode === "watch" ? "Read-only watch" : "Control";
  if (!terminalReady) {
    return "Loading terminal runtime.";
  }
  if (status === "reconnecting") {
    return `Reconnecting. Attempt ${reconnectAttempt}. ${lastSocketFailure || "Connection issue detected."}`;
  }
  if (status === "error") {
    return `Connection error. ${lastSocketFailure || "Unable to maintain transport."}`;
  }
  return `Connection status ${statusText}. ${modeLabel} mode.`;
}
