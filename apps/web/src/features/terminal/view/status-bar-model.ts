import type { ConnectionStatus } from "../contracts/connection";
import type { AttachMode } from "../contracts/session/session";

export type StatusBarModel = {
  controlsOpen: boolean;
  sessionMenuOpen: boolean;
  status: ConnectionStatus;
  latencyTone: "neutral" | "good" | "warn" | "bad";
  statusText: string;
  latencyText: string;
  sessionName: string | null;
  sessionDisplay: string;
  attachMode: AttachMode;
  reconnectAttempt: number;
  queuedInputText: string;
  droppedInputText: string;
  outputText: string;
  outputBytes: number;
};
