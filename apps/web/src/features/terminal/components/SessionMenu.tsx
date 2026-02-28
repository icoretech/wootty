import { Eye, History, Play, Plus } from "lucide-react";

type SessionCandidate = {
  id: string;
  action: "resume" | "watch";
  command: string;
  watchers: number;
  lastActivityMs: number;
};

type SessionMenuProps = {
  open: boolean;
  terminalReady: boolean;
  lastSessionId: string;
  sessionNotice: string;
  liveSessionCandidates: SessionCandidate[];
  historySessionCandidates: string[];
  onStartFreshSession: () => void;
  onResumePreviousSession: () => void;
  onResumeSession: (sessionId: string, mode: "control" | "watch") => void;
  formatSessionId: (value: string) => string;
  formatAgeLabel: (timestampMs: number) => string;
};

export function SessionMenu({
  open,
  terminalReady,
  lastSessionId,
  sessionNotice,
  liveSessionCandidates,
  historySessionCandidates,
  onStartFreshSession,
  onResumePreviousSession,
  onResumeSession,
  formatSessionId,
  formatAgeLabel,
}: SessionMenuProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="session-menu" data-testid="session-menu">
      <button
        type="button"
        className="session-menu__action"
        data-testid="session-menu-new"
        onClick={onStartFreshSession}
        disabled={!terminalReady}
      >
        <Plus size={14} aria-hidden="true" />
        New session
      </button>
      <button
        type="button"
        className="session-menu__action"
        data-testid="session-menu-resume-last"
        onClick={onResumePreviousSession}
        disabled={!terminalReady || !lastSessionId}
      >
        <History size={14} aria-hidden="true" />
        Resume last
      </button>
      {sessionNotice && (
        <p className="session-menu__notice" data-testid="session-menu-notice">
          {sessionNotice}
        </p>
      )}
      <p className="session-menu__section-title">Live sessions</p>
      <div className="session-menu__list">
        {liveSessionCandidates.length === 0 ? (
          <p className="session-menu__empty">No live resumable sessions</p>
        ) : (
          liveSessionCandidates.map((candidate) => {
            const actionLabel = candidate.action === "watch" ? "Watch" : "Resume";
            const secondaryParts = [
              candidate.command || "interactive shell",
              formatAgeLabel(candidate.lastActivityMs),
            ];
            if (candidate.watchers > 0) {
              secondaryParts.push(
                `${candidate.watchers} watcher${candidate.watchers === 1 ? "" : "s"}`,
              );
            }

            return (
              <button
                key={`live:${candidate.id}`}
                type="button"
                className="session-menu__resume"
                data-testid={
                  candidate.action === "watch"
                    ? "session-menu-watch-item"
                    : "session-menu-resume-item"
                }
                onClick={() => {
                  onResumeSession(
                    candidate.id,
                    candidate.action === "watch" ? "watch" : "control",
                  );
                }}
                disabled={!terminalReady}
              >
                <span className="session-menu__primary">
                  {formatSessionId(candidate.id)}
                </span>
                <span className="session-menu__secondary">
                  {secondaryParts.join(" · ")}
                </span>
                <strong>
                  {candidate.action === "watch" ? (
                    <>
                      <Eye size={12} aria-hidden="true" />
                      {actionLabel}
                    </>
                  ) : (
                    <>
                      <Play size={12} aria-hidden="true" />
                      {actionLabel}
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
        {historySessionCandidates.length === 0 ? (
          <p className="session-menu__empty">No recent sessions</p>
        ) : (
          historySessionCandidates.map((historySessionId) => (
            <div
              key={`history:${historySessionId}`}
              className="session-menu__resume session-menu__resume--inactive"
              data-testid="session-menu-history-item"
            >
              <span className="session-menu__primary">
                {formatSessionId(historySessionId)}
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
