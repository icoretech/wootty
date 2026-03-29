import { CircleHelp } from "lucide-react";
import { useEffect } from "react";
import { COMMAND_MANIFEST } from "../commands/definitions/command-manifest";

type ShortcutsPanelProps = {
  open: boolean;
  onClose: () => void;
};

const SHORTCUT_CODE_DISPLAY: Record<string, string> = {
  KeyR: "R",
  KeyK: "K",
  KeyF: "F",
  KeyB: "B",
  Minus: "-",
  Equal: "=",
  Digit0: "0",
  Period: ".",
};

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function formatShortcut(shortcutCode: string, isMac: boolean): string {
  const key = SHORTCUT_CODE_DISPLAY[shortcutCode] ?? shortcutCode;
  const modifier = isMac ? "\u2318 Shift" : "Ctrl Shift";
  return `${modifier} ${key}`;
}

export function ShortcutsPanel({ open, onClose }: ShortcutsPanelProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const isMac = isMacPlatform();
  const entries = COMMAND_MANIFEST.filter(
    (entry) => typeof entry.label === "string" && entry.label.length > 0,
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss uses Escape key handler
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape key handler provides keyboard equivalent
    <div
      className="shortcuts-panel__backdrop"
      data-testid="shortcuts-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="shortcuts-panel"
        role="dialog"
        aria-label="Keyboard shortcuts"
        data-testid="shortcuts-panel"
      >
        <div className="shortcuts-panel__header">
          <CircleHelp size={16} aria-hidden="true" />
          <span>Keyboard shortcuts</span>
        </div>
        <ul className="shortcuts-panel__list">
          {entries.map((entry) => (
            <li key={entry.id} className="shortcuts-panel__row">
              <span className="shortcuts-panel__label">{entry.label}</span>
              <kbd className="shortcuts-panel__key">
                {formatShortcut(entry.shortcutCode, isMac)}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
