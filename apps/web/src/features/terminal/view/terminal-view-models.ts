import type { TransportFailureContext } from "../app/engine/transport/state/transport-state-machine";
import type { ConnectionStatus } from "../contracts/connection";
import type { AttachMode, SessionSnapshot } from "../contracts/session/session";
import { formatBytes, formatLatency } from "../lib/terminal-format";
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
} from "../preferences/font-size-policy";
import {
  ageLabel,
  latencyTone,
  shortSessionId,
  statusLabel,
} from "../presentation/formatters";
import { presentSessionCandidate } from "../presentation/session-menu-presenter";
import { deriveSessionCandidates } from "../session/domain/session-candidates";
import type { FloatingControlsModel } from "./floating-controls-model";
import type { SessionMenuModel } from "./session-menu-model";
import type { StatusBarModel } from "./status-bar-model";

type TerminalViewModelInput = {
  ui: {
    controlsOpen: boolean;
    fontSize: number;
    isFullscreen: boolean;
  };
  session: {
    sessionMenuOpen: boolean;
    lastSessionId: string | null;
    sessionNotice: string;
    liveSessions: SessionSnapshot[];
    sessionId: string | null;
    sessionHistoryIds: string[];
    attachMode: AttachMode;
  };
  connection: {
    terminalReady: boolean;
    status: ConnectionStatus;
    latencyMs: number | null;
    reconnectAttempt: number;
  };
  telemetry: {
    queuedInputBytes: number;
    droppedInputBytes: number;
    outputBytes: number;
  };
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
  const { ui, session, connection, telemetry } = input;

  const statusText = statusLabel(connection.status);
  const sessionDisplay = session.sessionId
    ? shortSessionId(session.sessionId)
    : "pending";
  const { liveSessionCandidates, historySessionCandidates } =
    deriveSessionCandidates({
      liveSessions: session.liveSessions,
      currentSessionId: session.sessionId,
      sessionHistoryIds: session.sessionHistoryIds,
      lastSessionId: session.lastSessionId,
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
    controlsOpen: ui.controlsOpen,
    terminalReady: connection.terminalReady,
    fontSize: ui.fontSize,
    fontSizeMin: FONT_SIZE_MIN,
    fontSizeMax: FONT_SIZE_MAX,
    defaultFontSize: DEFAULT_FONT_SIZE,
    isFullscreen: ui.isFullscreen,
  };

  const sessionMenuModel: SessionMenuModel = {
    sessionMenuOpen: session.sessionMenuOpen,
    terminalReady: connection.terminalReady,
    canResumeLast: session.lastSessionId !== null,
    sessionNotice: session.sessionNotice,
    liveRows: sessionMenuLiveRows,
    historyRows: sessionMenuHistoryRows,
  };

  const tone = latencyTone(connection.status, connection.latencyMs);
  const statusBarModel: StatusBarModel = {
    controlsOpen: ui.controlsOpen,
    sessionMenuOpen: session.sessionMenuOpen,
    status: connection.status,
    latencyTone: tone,
    statusText,
    latencyText: formatLatency(connection.latencyMs),
    sessionDisplay,
    attachMode: session.attachMode,
    reconnectAttempt: connection.reconnectAttempt,
    queuedInputText: formatBytes(telemetry.queuedInputBytes),
    droppedInputText: formatBytes(telemetry.droppedInputBytes),
    outputText: formatBytes(telemetry.outputBytes),
    outputBytes: telemetry.outputBytes,
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
  lastSocketFailure: TransportFailureContext | null;
  statusText: string;
  attachMode: AttachMode;
}): string {
  const modeLabel = attachMode === "watch" ? "Read-only watch" : "Control";
  const failureSummary = summarizeTransportFailure(lastSocketFailure);
  if (!terminalReady) {
    return "Loading terminal runtime.";
  }
  if (status === "reconnecting") {
    return `Reconnecting. Attempt ${reconnectAttempt}. ${failureSummary || "Connection issue detected."}`;
  }
  if (status === "error") {
    return `Connection error. ${failureSummary || "Unable to maintain transport."}`;
  }
  return `Connection status ${statusText}. ${modeLabel} mode.`;
}

function summarizeTransportFailure(
  failure: TransportFailureContext | null,
): string | null {
  if (!failure) {
    return null;
  }
  const parts: string[] = [failure.source];
  if (failure.reasonCode) {
    parts.push(`reason=${failure.reasonCode}`);
  }
  if (typeof failure.code === "string" || typeof failure.code === "number") {
    parts.push(`code=${failure.code}`);
  }
  if (failure.technicalDetail && failure.technicalDetail.length > 0) {
    parts.push(`detail=${failure.technicalDetail}`);
  }
  return parts.join(" ");
}
