import type { ConnectionStatus } from "../../contracts/connection";
import type {
  AttachMode,
  SessionSnapshot,
} from "../../contracts/session/session";
import {
  buildStatusAnnouncement,
  buildTerminalViewModels,
} from "../../view/terminal-view-models";
import type { FloatingControlsModel } from "../../view/floating-controls-model";
import type { SessionMenuModel } from "../../view/session-menu-model";
import type { StatusBarModel } from "../../view/status-bar-model";
import type { TransportFailureContext } from "../engine/transport/state/transport-state-machine";

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
    lastSocketFailure: TransportFailureContext | null;
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

export function buildTerminalPresentationModel({
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
    ui: uiState,
    session: sessionState,
    connection: {
      terminalReady: connectionRuntime.terminalReady,
      status: connectionTransport.status,
      latencyMs: connectionTransport.latencyMs,
      reconnectAttempt: connectionTransport.reconnectAttempt,
    },
    telemetry: connectionTelemetry,
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
