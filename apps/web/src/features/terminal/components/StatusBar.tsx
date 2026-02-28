import { ChevronDown, SlidersHorizontal, Wifi, WifiOff } from "lucide-react";
import type { RefObject } from "react";

type StatusBarProps = {
  controlsOpen: boolean;
  sessionMenuOpen: boolean;
  status: "connecting" | "connected" | "reconnecting" | "closed" | "error";
  latencyTone: "neutral" | "good" | "warn" | "bad";
  statusText: string;
  latencyText: string;
  sessionDisplay: string;
  attachMode: "control" | "watch";
  reconnectAttempt: number;
  queuedInputText: string;
  droppedInputText: string;
  outputText: string;
  outputBytes: number;
  sessionButtonRef: RefObject<HTMLDivElement | null>;
  onToggleControls: () => void;
  onToggleSessionMenu: () => void;
};

export function StatusBar({
  controlsOpen,
  sessionMenuOpen,
  status,
  latencyTone,
  statusText,
  latencyText,
  sessionDisplay,
  attachMode,
  reconnectAttempt,
  queuedInputText,
  droppedInputText,
  outputText,
  outputBytes,
  sessionButtonRef,
  onToggleControls,
  onToggleSessionMenu,
}: StatusBarProps) {
  const StatusIcon = status === "connected" ? Wifi : WifiOff;

  return (
    <footer className="statusbar">
      <div className="statusbar__group">
        <button
          type="button"
          className="controls-toggle statusbar-toggle"
          data-testid="controls-toggle"
          aria-expanded={controlsOpen}
          aria-label={controlsOpen ? "Hide terminal controls" : "Show terminal controls"}
          onClick={onToggleControls}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
        </button>

        <span className="status-pill" data-status={status} data-latency={latencyTone}>
          <StatusIcon size={13} aria-hidden="true" />
          <span data-testid="status-label">{statusText}</span>
          <span className="status-pill__latency" data-testid="latency-value">
            {latencyText}
          </span>
        </span>

        <div className="status-session" ref={sessionButtonRef}>
          <button
            type="button"
            className="status-item status-item--button status-session__button"
            data-testid="session-menu-button"
            aria-expanded={sessionMenuOpen}
            aria-label="Open session menu"
            onClick={onToggleSessionMenu}
          >
            <span>Session</span>
            <strong className="status-session__value" data-testid="session-value">
              {sessionDisplay}
            </strong>
            <ChevronDown size={12} aria-hidden="true" />
          </button>
        </div>
        <span className="status-item" data-mode={attachMode}>
          {attachMode === "watch" ? "Read-only" : "Control"}
        </span>
      </div>
      <div className="statusbar__group">
        <span className="status-item">
          Reconnects <strong>{reconnectAttempt}</strong>
        </span>
        <span className="status-item">
          Buffered <strong>{queuedInputText}</strong>
        </span>
        <span className="status-item">
          Dropped <strong>{droppedInputText}</strong>
        </span>
        <span className="status-item">
          Output <strong data-testid="output-value" data-bytes={outputBytes}>{outputText}</strong>
        </span>
      </div>
    </footer>
  );
}
