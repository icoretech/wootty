import type { ConnectionStatus } from "../contracts/connection";
import type { AttachMode, SessionSnapshot } from "../contracts/session/session";
import {
  buildStatusAnnouncement,
  buildTerminalViewModels,
} from "../view/terminal-view-models";
import type { FloatingControlsModel } from "../view-models/floating-controls-model";
import type { SessionMenuModel } from "../view-models/session-menu-model";
import type { StatusBarModel } from "../view-models/status-bar-model";

type TerminalPresentationInput = {
  uiState: {
    controlsOpen: boolean;
    fontSize: number;
    isFullscreen: boolean;
  };
  sessionState: {
    sessionMenuOpen: boolean;
    lastSessionId: string | null;
    sessionNotice: string;
    liveSessions: SessionSnapshot[];
    sessionId: string | null;
    sessionHistoryIds: string[];
    attachMode: AttachMode;
  };
  connectionRuntime: {
    terminalReady: boolean;
  };
  connectionTransport: {
    status: ConnectionStatus;
    latencyMs: number | null;
    reconnectAttempt: number;
    lastSocketFailure: string;
  };
  connectionTelemetry: {
    queuedInputBytes: number;
    droppedInputBytes: number;
    outputBytes: number;
  };
};

type TerminalPresentationModel = {
  statusText: string;
  statusAnnouncement: string;
  floatingControlsModel: FloatingControlsModel;
  sessionMenuModel: SessionMenuModel;
  statusBarModel: StatusBarModel;
};

export function useTerminalPresentationModel({
  uiState,
  sessionState,
  connectionRuntime,
  connectionTransport,
  connectionTelemetry,
}: TerminalPresentationInput): TerminalPresentationModel {
  const {
    statusText,
    floatingControlsModel,
    sessionMenuModel,
    statusBarModel,
  } = buildTerminalViewModels({
    controlsOpen: uiState.controlsOpen,
    terminalReady: connectionRuntime.terminalReady,
    fontSize: uiState.fontSize,
    isFullscreen: uiState.isFullscreen,
    sessionMenuOpen: sessionState.sessionMenuOpen,
    lastSessionId: sessionState.lastSessionId,
    sessionNotice: sessionState.sessionNotice,
    liveSessions: sessionState.liveSessions,
    sessionId: sessionState.sessionId,
    sessionHistoryIds: sessionState.sessionHistoryIds,
    status: connectionTransport.status,
    latencyMs: connectionTransport.latencyMs,
    attachMode: sessionState.attachMode,
    reconnectAttempt: connectionTransport.reconnectAttempt,
    queuedInputBytes: connectionTelemetry.queuedInputBytes,
    droppedInputBytes: connectionTelemetry.droppedInputBytes,
    outputBytes: connectionTelemetry.outputBytes,
  });
  const statusAnnouncement = buildStatusAnnouncement({
    terminalReady: connectionRuntime.terminalReady,
    status: connectionTransport.status,
    reconnectAttempt: connectionTransport.reconnectAttempt,
    lastSocketFailure: connectionTransport.lastSocketFailure,
    statusText,
    attachMode: sessionState.attachMode,
  });

  return {
    statusText,
    statusAnnouncement,
    floatingControlsModel,
    sessionMenuModel,
    statusBarModel,
  };
}
