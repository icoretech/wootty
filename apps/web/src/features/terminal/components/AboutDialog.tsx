import { ExternalLink, SquareTerminal } from "lucide-react";
import { useEffect } from "react";
import { COMMAND_MANIFEST } from "../commands/definitions/command-manifest";

type AboutDialogProps = {
  open: boolean;
  onClose: () => void;
  session: {
    id: string | null;
    name: string | null;
    command: string | null;
    attachMode: "control" | "watch";
    status: string;
    watchers: number;
  };
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

function formatShortcutCompact(shortcutCode: string, isMac: boolean): string {
  const key = SHORTCUT_CODE_DISPLAY[shortcutCode] ?? shortcutCode;
  const mod = isMac ? "Cmd Shift" : "Ctrl Shift";
  return `${mod} ${key}`;
}

export function AboutDialog({ open, onClose, session }: AboutDialogProps) {
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
  const shortcuts = COMMAND_MANIFEST.filter(
    (entry) => typeof entry.label === "string" && entry.label.length > 0,
  );

  const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop uses Escape key handler
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape key provides keyboard equivalent
    <div
      className="about-dialog__backdrop"
      data-testid="about-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="about-dialog"
        role="dialog"
        aria-label="About WooTTY"
        data-testid="about-dialog"
      >
        <div className="about-dialog__header">
          <SquareTerminal size={16} aria-hidden="true" />
          <span className="about-dialog__title">WooTTY</span>
          <span className="about-dialog__version">{version}</span>
        </div>

        <div className="about-dialog__section">
          <div className="about-dialog__section-label">Session</div>
          <div className="about-dialog__meta">
            {session.id ? (
              <>
                <span className="about-dialog__meta-row">
                  <span className="about-dialog__meta-key">id</span>
                  <code className="about-dialog__meta-value">
                    {session.name ?? session.id}
                  </code>
                </span>
                {session.command && (
                  <span className="about-dialog__meta-row">
                    <span className="about-dialog__meta-key">cmd</span>
                    <code className="about-dialog__meta-value">
                      {session.command}
                    </code>
                  </span>
                )}
                <span className="about-dialog__meta-row">
                  <span className="about-dialog__meta-key">mode</span>
                  <span className="about-dialog__meta-value">
                    {session.attachMode === "watch" ? "read-only" : "control"}
                  </span>
                </span>
                {session.watchers > 0 && (
                  <span className="about-dialog__meta-row">
                    <span className="about-dialog__meta-key">watchers</span>
                    <span className="about-dialog__meta-value">
                      {session.watchers}
                    </span>
                  </span>
                )}
              </>
            ) : (
              <span className="about-dialog__meta-row about-dialog__meta-row--dim">
                no active session
              </span>
            )}
          </div>
        </div>

        <div className="about-dialog__section">
          <div className="about-dialog__section-label">Shortcuts</div>
          <div className="about-dialog__shortcuts">
            {shortcuts.map((entry) => (
              <span key={entry.id} className="about-dialog__shortcut">
                <span className="about-dialog__shortcut-label">
                  {entry.label}
                </span>
                <kbd className="about-dialog__shortcut-key">
                  {formatShortcutCompact(entry.shortcutCode, isMac)}
                </kbd>
              </span>
            ))}
          </div>
        </div>

        <div className="about-dialog__links">
          <a
            href="https://github.com/icoretech/wootty"
            target="_blank"
            rel="noopener noreferrer"
            className="about-dialog__link"
          >
            <ExternalLink size={11} aria-hidden="true" />
            GitHub
          </a>
          <span className="about-dialog__license">MIT</span>
        </div>
      </div>
    </div>
  );
}
