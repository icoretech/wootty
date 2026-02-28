import { Eye, History, Play, Plus } from "lucide-react";
import type { AttachMode } from "../contracts/session";

export type SessionMenuAction =
  | { type: "startFresh" }
  | { type: "resumeLast" }
  | { type: "attach"; sessionId: string; mode: AttachMode };

export type SessionMenuModel = {
  sessionMenuOpen: boolean;
  terminalReady: boolean;
  canResumeLast: boolean;
  sessionNotice: string;
  liveRows: Array<{
    id: string;
    mode: AttachMode;
    primaryText: string;
    secondaryText: string;
    actionLabel: string;
  }>;
  historyRows: Array<{ id: string; primaryText: string }>;
};

type SessionMenuProps = {
  model: SessionMenuModel;
  dispatch: (action: SessionMenuAction) => void;
};

export function SessionMenu({ model, dispatch }: SessionMenuProps) {
  if (!model.sessionMenuOpen) {
    return null;
  }

  return (
    <div className="session-menu" data-testid="session-menu">
      <button
        type="button"
        className="session-menu__action"
        data-testid="session-menu-new"
        onClick={() => {
          dispatch({ type: "startFresh" });
        }}
        disabled={!model.terminalReady}
      >
        <Plus size={14} aria-hidden="true" />
        New session
      </button>
      <button
        type="button"
        className="session-menu__action"
        data-testid="session-menu-resume-last"
        onClick={() => {
          dispatch({ type: "resumeLast" });
        }}
        disabled={!model.terminalReady || !model.canResumeLast}
      >
        <History size={14} aria-hidden="true" />
        Resume last
      </button>
      {model.sessionNotice && (
        <p className="session-menu__notice" data-testid="session-menu-notice">
          {model.sessionNotice}
        </p>
      )}
      <p className="session-menu__section-title">Live sessions</p>
      <div className="session-menu__list">
        {model.liveRows.length === 0 ? (
          <p className="session-menu__empty">No live resumable sessions</p>
        ) : (
          model.liveRows.map((row) => {
            return (
              <button
                key={`live:${row.id}`}
                type="button"
                className="session-menu__resume"
                data-testid={
                  row.mode === "watch"
                    ? "session-menu-watch-item"
                    : "session-menu-resume-item"
                }
                onClick={() => {
                  dispatch({
                    type: "attach",
                    sessionId: row.id,
                    mode: row.mode,
                  });
                }}
                disabled={!model.terminalReady}
              >
                <span className="session-menu__primary">{row.primaryText}</span>
                <span className="session-menu__secondary">
                  {row.secondaryText}
                </span>
                <strong>
                  {row.mode === "watch" ? (
                    <>
                      <Eye size={12} aria-hidden="true" />
                      {row.actionLabel}
                    </>
                  ) : (
                    <>
                      <Play size={12} aria-hidden="true" />
                      {row.actionLabel}
                    </>
                  )}
                </strong>
              </button>
            );
          })
        )}
      </div>
      <p className="session-menu__section-title">Recent session ids</p>
      <div className="session-menu__list">
        {model.historyRows.length === 0 ? (
          <p className="session-menu__empty">No recent sessions</p>
        ) : (
          model.historyRows.map((historyRow) => (
            <div
              key={`history:${historyRow.id}`}
              className="session-menu__resume session-menu__resume--inactive"
              data-testid="session-menu-history-item"
            >
              <span className="session-menu__primary">
                {historyRow.primaryText}
              </span>
              <span className="session-menu__secondary">
                Not currently running on server
              </span>
              <strong>Unavailable</strong>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
