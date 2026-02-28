import { ChevronDown, SlidersHorizontal, Wifi, WifiOff } from "lucide-react";
import type { RefObject } from "react";
import type { ConnectionStatus } from "../contracts/connection";
import type { AttachMode } from "../contracts/session";

export type StatusBarAction =
  | { type: "toggleControls" }
  | { type: "toggleSessionMenu" };

export type StatusBarModel = {
  controlsOpen: boolean;
  sessionMenuOpen: boolean;
  status: ConnectionStatus;
  latencyTone: "neutral" | "good" | "warn" | "bad";
  statusText: string;
  latencyText: string;
  sessionDisplay: string;
  attachMode: AttachMode;
  reconnectAttempt: number;
  queuedInputText: string;
  droppedInputText: string;
  outputText: string;
  outputBytes: number;
  sessionButtonRef: RefObject<HTMLDivElement | null>;
};

type StatusBarProps = {
  model: StatusBarModel;
  dispatch: (action: StatusBarAction) => void;
};

export function StatusBar({ model, dispatch }: StatusBarProps) {
  const StatusIcon = model.status === "connected" ? Wifi : WifiOff;

  return (
    <footer className="statusbar">
      <div className="statusbar__group">
        <button
          type="button"
          className="controls-toggle statusbar-toggle"
          data-testid="controls-toggle"
          aria-expanded={model.controlsOpen}
          aria-label={
            model.controlsOpen
              ? "Hide terminal controls"
              : "Show terminal controls"
          }
          onClick={() => {
            dispatch({ type: "toggleControls" });
          }}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
        </button>

        <span
          className="status-pill"
          data-status={model.status}
          data-latency={model.latencyTone}
        >
          <StatusIcon size={13} aria-hidden="true" />
          <span data-testid="status-label">{model.statusText}</span>
          <span className="status-pill__latency" data-testid="latency-value">
            {model.latencyText}
          </span>
        </span>

        <div className="status-session" ref={model.sessionButtonRef}>
          <button
            type="button"
            className="status-item status-item--button status-session__button"
            data-testid="session-menu-button"
            aria-expanded={model.sessionMenuOpen}
            aria-label="Open session menu"
            onClick={() => {
              dispatch({ type: "toggleSessionMenu" });
            }}
          >
            <span>Session</span>
            <strong
              className="status-session__value"
              data-testid="session-value"
            >
              {model.sessionDisplay}
            </strong>
            <ChevronDown size={12} aria-hidden="true" />
          </button>
        </div>
        <span className="status-item" data-mode={model.attachMode}>
          {model.attachMode === "watch" ? "Read-only" : "Control"}
        </span>
      </div>
      <div className="statusbar__group">
        <span className="status-item">
          Reconnects <strong>{model.reconnectAttempt}</strong>
        </span>
        <span className="status-item">
          Buffered <strong>{model.queuedInputText}</strong>
        </span>
        <span className="status-item">
          Dropped <strong>{model.droppedInputText}</strong>
        </span>
        <span className="status-item">
          Output{" "}
          <strong data-testid="output-value" data-bytes={model.outputBytes}>
            {model.outputText}
          </strong>
        </span>
      </div>
    </footer>
  );
}
