import {
  Eraser,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RefreshCcw,
  RotateCcw,
} from "lucide-react";
export type FloatingControlsAction =
  | { type: "reconnect" }
  | { type: "clear" }
  | { type: "decreaseFont" }
  | { type: "increaseFont" }
  | { type: "resetFont" }
  | { type: "toggleFullscreen" };

export type FloatingControlsModel = {
  controlsOpen: boolean;
  terminalReady: boolean;
  fontSize: number;
  fontSizeMin: number;
  fontSizeMax: number;
  defaultFontSize: number;
  isFullscreen: boolean;
};

type FloatingControlsProps = {
  model: FloatingControlsModel;
  dispatch: (action: FloatingControlsAction) => void;
};

export function FloatingControls({ model, dispatch }: FloatingControlsProps) {
  return (
    <aside
      className={`floating-controls ${model.controlsOpen ? "is-open" : ""}`}
      aria-label="Terminal controls"
    >
      <div className="floating-controls__item">
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "reconnect" });
          }}
          data-testid="reconnect-button"
          disabled={!model.terminalReady}
          aria-keyshortcuts="Control+Shift+R Meta+Shift+R"
          aria-label="Reconnect terminal session"
        >
          <RotateCcw size={16} />
        </button>
        <span className="floating-controls__tooltip">Reconnect</span>
      </div>
      <div className="floating-controls__item">
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "clear" });
          }}
          data-testid="clear-button"
          disabled={!model.terminalReady}
          aria-keyshortcuts="Control+Shift+K Meta+Shift+K"
          aria-label="Clear terminal viewport"
        >
          <Eraser size={16} />
        </button>
        <span className="floating-controls__tooltip">Clear</span>
      </div>
      <div className="floating-controls__item">
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "decreaseFont" });
          }}
          data-testid="font-decrease-button"
          disabled={!model.terminalReady || model.fontSize <= model.fontSizeMin}
          aria-keyshortcuts="Control+Shift+- Meta+Shift+-"
          aria-label="Decrease terminal font size"
        >
          <Minus size={16} />
        </button>
        <span className="floating-controls__tooltip">Font down</span>
      </div>
      <div className="floating-controls__item">
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "increaseFont" });
          }}
          data-testid="font-increase-button"
          disabled={!model.terminalReady || model.fontSize >= model.fontSizeMax}
          aria-keyshortcuts="Control+Shift+= Meta+Shift+="
          aria-label="Increase terminal font size"
        >
          <Plus size={16} />
        </button>
        <span className="floating-controls__tooltip">Font up</span>
      </div>
      <div className="floating-controls__item">
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "resetFont" });
          }}
          data-testid="font-reset-button"
          disabled={
            !model.terminalReady || model.fontSize === model.defaultFontSize
          }
          aria-keyshortcuts="Control+Shift+0 Meta+Shift+0"
          aria-label="Reset terminal font size"
        >
          <RefreshCcw size={16} />
        </button>
        <span className="floating-controls__tooltip">Reset font</span>
      </div>
      <div className="floating-controls__item">
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "toggleFullscreen" });
          }}
          data-testid="fullscreen-button"
          disabled={!model.terminalReady}
          aria-label={
            model.isFullscreen
              ? "Exit fullscreen terminal"
              : "Enter fullscreen terminal"
          }
        >
          {model.isFullscreen ? (
            <Minimize2 size={16} />
          ) : (
            <Maximize2 size={16} />
          )}
        </button>
        <span className="floating-controls__tooltip">
          {model.isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        </span>
      </div>
    </aside>
  );
}
