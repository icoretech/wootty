import { Eye, History, Play, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { SessionMenuAction } from "../commands/session-menu-actions";
import type { SessionMenuModel } from "../view/session-menu-model";

type SessionMenuProps = {
  model: SessionMenuModel;
  dispatch: (action: SessionMenuAction) => void;
};

type SessionDashboardFilter = "all" | "control" | "watch" | "recent";

function matchesSessionSearch(
  query: string,
  ...values: Array<string | null | undefined>
): boolean {
  if (query.length === 0) {
    return true;
  }

  return values.some((value) => value?.toLowerCase().includes(query));
}

export function SessionMenu({ model, dispatch }: SessionMenuProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<SessionDashboardFilter>("all");

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredLiveRows = useMemo(() => {
    return model.liveRows.filter((row) => {
      const matchesFilter = filter === "all" || filter === row.mode;

      if (!matchesFilter) {
        return false;
      }

      return matchesSessionSearch(
        normalizedQuery,
        row.id,
        row.primaryText,
        row.secondaryText,
        row.actionLabel,
      );
    });
  }, [filter, model.liveRows, normalizedQuery]);

  const filteredHistoryRows = useMemo(() => {
    return model.historyRows.filter((row) => {
      if (filter !== "all" && filter !== "recent") {
        return false;
      }

      return matchesSessionSearch(normalizedQuery, row.id, row.primaryText);
    });
  }, [filter, model.historyRows, normalizedQuery]);

  const liveControlCount = model.liveRows.filter(
    (row) => row.mode === "control",
  ).length;
  const liveWatchCount = model.liveRows.filter(
    (row) => row.mode === "watch",
  ).length;

  if (!model.sessionMenuOpen) {
    return null;
  }

  return (
    <div className="session-menu" data-testid="session-menu">
      <div className="session-menu__header">
        <div>
          <p className="session-menu__eyebrow">Session dashboard</p>
          <h2 className="session-menu__title">
            Resume or inspect terminal sessions
          </h2>
        </div>
        <ul className="session-menu__stats">
          <li
            className="session-menu__stat"
            data-testid="session-menu-stat-live"
          >
            Live <strong>{model.liveRows.length}</strong>
          </li>
          <li className="session-menu__stat">
            Control <strong>{liveControlCount}</strong>
          </li>
          <li className="session-menu__stat">
            Watch <strong>{liveWatchCount}</strong>
          </li>
          <li className="session-menu__stat">
            Recent <strong>{model.historyRows.length}</strong>
          </li>
        </ul>
      </div>

      <label className="session-menu__search" htmlFor="session-menu-search">
        <Search size={14} aria-hidden="true" />
        <input
          id="session-menu-search"
          className="session-menu__search-input"
          data-testid="session-menu-search"
          type="search"
          value={searchQuery}
          placeholder="Search by name, id, command, or status"
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </label>

      <div
        className="session-menu__filters"
        role="tablist"
        aria-label="Session filters"
      >
        {(
          [
            ["all", "All"],
            ["control", "Control"],
            ["watch", "Watch"],
            ["recent", "Recent"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="session-menu__filter"
            data-testid={`session-menu-filter-${value}`}
            data-active={filter === value ? "true" : "false"}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="session-menu__actions">
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
      </div>
      {model.sessionNotice && (
        <p className="session-menu__notice" data-testid="session-menu-notice">
          {model.sessionNotice}
        </p>
      )}

      <p className="session-menu__section-title">
        Live sessions <span>{filteredLiveRows.length}</span>
      </p>
      <div className="session-menu__list">
        {filteredLiveRows.length === 0 ? (
          <p className="session-menu__empty">
            {model.liveRows.length === 0
              ? "No live resumable sessions"
              : "No live sessions match the current filter"}
          </p>
        ) : (
          filteredLiveRows.map((row) => {
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

      <p className="session-menu__section-title">
        Recent session ids <span>{filteredHistoryRows.length}</span>
      </p>
      <div className="session-menu__list">
        {filteredHistoryRows.length === 0 ? (
          <p className="session-menu__empty">
            {model.historyRows.length === 0
              ? "No recent sessions"
              : "No recent session ids match the current filter"}
          </p>
        ) : (
          filteredHistoryRows.map((historyRow) => (
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
