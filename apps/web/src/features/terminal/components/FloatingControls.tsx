import {
  Eraser,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RefreshCcw,
  RotateCcw,
} from "lucide-react";

type FloatingControlsProps = {
  controlsOpen: boolean;
  terminalReady: boolean;
  fontSize: number;
  fontSizeMin: number;
  fontSizeMax: number;
  defaultFontSize: number;
  isFullscreen: boolean;
  onReconnect: () => void;
  onClearTerminal: () => void;
  onApplyFontSize: (next: number) => void;
  onToggleFullscreen: () => Promise<void>;
};

export function FloatingControls({
  controlsOpen,
  terminalReady,
  fontSize,
  fontSizeMin,
  fontSizeMax,
  defaultFontSize,
  isFullscreen,
  onReconnect,
  onClearTerminal,
  onApplyFontSize,
  onToggleFullscreen,
}: FloatingControlsProps) {
  return (
    <aside
      className={`floating-controls ${controlsOpen ? "is-open" : ""}`}
      aria-label="Terminal controls"
    >
      <div className="floating-controls__item">
        <button
          type="button"
          onClick={onReconnect}
          data-testid="reconnect-button"
          disabled={!terminalReady}
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
          onClick={onClearTerminal}
          data-testid="clear-button"
          disabled={!terminalReady}
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
            onApplyFontSize(fontSize - 1);
          }}
          data-testid="font-decrease-button"
          disabled={!terminalReady || fontSize <= fontSizeMin}
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
            onApplyFontSize(fontSize + 1);
          }}
          data-testid="font-increase-button"
          disabled={!terminalReady || fontSize >= fontSizeMax}
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
            onApplyFontSize(defaultFontSize);
          }}
          data-testid="font-reset-button"
          disabled={!terminalReady || fontSize === defaultFontSize}
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
            void onToggleFullscreen();
          }}
          data-testid="fullscreen-button"
          disabled={!terminalReady}
          aria-label={
            isFullscreen ? "Exit fullscreen terminal" : "Enter fullscreen terminal"
          }
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <span className="floating-controls__tooltip">
          {isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        </span>
      </div>
    </aside>
  );
}
