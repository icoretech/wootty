import { Check, ChevronDown, Copy, SlidersHorizontal } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { StatusBarAction } from "../commands/status-bar-actions";
import { VIEWPORT_UI_COMMAND } from "../commands/viewport-commands";
import type { StatusBarModel } from "../view/status-bar-model";

type StatusBarProps = {
  model: StatusBarModel;
  sessionButtonRef: RefObject<HTMLDivElement | null>;
  dispatch: (action: StatusBarAction) => void;
};

export function StatusBar({
  model,
  sessionButtonRef,
  dispatch,
}: StatusBarProps) {
  const [copyConfirmed, setCopyConfirmed] = useState(false);
  const copyResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const scheduleCopyFeedbackReset = () => {
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyConfirmed(false);
      copyResetTimerRef.current = null;
    }, 1400);
  };

  const copyCurrentSessionName = () => {
    if (!model.sessionName) {
      return;
    }
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") {
      return;
    }
    void clipboard
      .writeText(model.sessionName)
      .then(() => {
        setCopyConfirmed(true);
        scheduleCopyFeedbackReset();
      })
      .catch(() => {
        setCopyConfirmed(false);
      });
  };

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
            dispatch({ type: VIEWPORT_UI_COMMAND.TOGGLE_CONTROLS });
          }}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
        </button>

        <span
          className="status-pill"
          data-status={model.status}
          data-latency={model.latencyTone}
        >
          <span data-testid="status-label">{model.statusText}</span>
          <span className="status-pill__latency" data-testid="latency-value">
            {model.latencyText}
          </span>
        </span>

        <div className="status-session" ref={sessionButtonRef}>
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
          <button
            type="button"
            className="status-item status-item--button status-session__copy"
            data-testid="session-copy-button"
            aria-label={
              copyConfirmed
                ? "Current session name copied"
                : "Copy current session name"
            }
            onClick={copyCurrentSessionName}
            disabled={!model.sessionName}
            data-copied={copyConfirmed ? "true" : "false"}
          >
            {copyConfirmed ? (
              <Check size={12} aria-hidden="true" />
            ) : (
              <Copy size={12} aria-hidden="true" />
            )}
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
