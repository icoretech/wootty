import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SessionsFetchResult } from "../../../../src/features/terminal/environment/terminal-environment-contract";
import { toUserNotice } from "../../../../src/features/terminal/notifications/user-notice";
import type { Scheduler } from "../../../../src/features/terminal/platform/scheduler";
import { useSessionOrchestrator } from "../../../../src/features/terminal/session/application/session-orchestrator";
import {
  LAST_SESSION_STORAGE_KEY,
  SESSION_HISTORY_STORAGE_KEY,
} from "../../../../src/features/terminal/session/persistence/storage-keys";
import { StorageDouble } from "../../../support/harness/storage-double";

type SessionProbeProps = {
  localStorageRef: Storage;
  sessionStorageRef: Storage;
  fetchSessions: () => Promise<SessionsFetchResult>;
};

const browserLikeScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (task, delayMs) => window.setTimeout(task, delayMs),
  clearTimeout: (timerId) => {
    window.clearTimeout(timerId);
  },
  setInterval: (task, intervalMs) => window.setInterval(task, intervalMs),
  clearInterval: (timerId) => {
    window.clearInterval(timerId);
  },
};

function SessionProbe({
  localStorageRef,
  sessionStorageRef,
  fetchSessions,
}: SessionProbeProps) {
  const session = useSessionOrchestrator({
    fetchSessions,
    getLocalStorage: () => localStorageRef,
    getSessionStorage: () => sessionStorageRef,
    scheduler: browserLikeScheduler,
    formatNotice: toUserNotice,
  });

  return (
    <section>
      <output data-testid="session-id">{session.state.sessionId}</output>
      <output data-testid="notice">{session.state.sessionNotice}</output>
      <output data-testid="live-count">
        {session.state.liveSessions.length}
      </output>
      <button
        type="button"
        data-testid="ready"
        onClick={() => {
          session.actions.applyReadySession("session-a", false);
        }}
      >
        ready
      </button>
      <button
        type="button"
        data-testid="refresh"
        onClick={() => {
          void session.actions.refreshLiveSessions();
        }}
      >
        refresh
      </button>
    </section>
  );
}

describe("session orchestrator", () => {
  it("persists last session and history on ready", async () => {
    const localStorageRef = new StorageDouble();
    const sessionStorageRef = new StorageDouble();
    const fetchSessions = vi.fn(async () => ({ ok: true, payload: [] }));

    render(
      <SessionProbe
        localStorageRef={localStorageRef}
        sessionStorageRef={sessionStorageRef}
        fetchSessions={fetchSessions}
      />,
    );

    fireEvent.click(screen.getByTestId("ready"));

    expect(screen.getByTestId("session-id").textContent).toBe("session-a");
    expect(localStorageRef.getItem(LAST_SESSION_STORAGE_KEY)).toBe("session-a");
    expect(localStorageRef.getItem(SESSION_HISTORY_STORAGE_KEY)).toContain(
      "session-a",
    );
  });

  it("loads live sessions from the refresh endpoint", async () => {
    const localStorageRef = new StorageDouble();
    const sessionStorageRef = new StorageDouble();
    const fetchSessions = vi.fn(async () => {
      return {
        ok: true,
        payload: {
          sessions: [
            {
              id: "session-a",
              hasController: true,
              canControl: false,
              watchers: 0,
              createdAtMs: Date.now(),
              lastActivityMs: Date.now(),
              command: "sh",
            },
          ],
        },
      } as const;
    });

    render(
      <SessionProbe
        localStorageRef={localStorageRef}
        sessionStorageRef={sessionStorageRef}
        fetchSessions={fetchSessions}
      />,
    );

    fireEvent.click(screen.getByTestId("refresh"));

    await waitFor(() => {
      expect(screen.getByTestId("live-count").textContent).toBe("1");
    });
  });

  it("publishes a notice when session refresh payload envelope is malformed", async () => {
    const localStorageRef = new StorageDouble();
    const sessionStorageRef = new StorageDouble();
    const fetchSessions = vi.fn(async () => ({ ok: true, payload: [] }));

    render(
      <SessionProbe
        localStorageRef={localStorageRef}
        sessionStorageRef={sessionStorageRef}
        fetchSessions={fetchSessions}
      />,
    );

    fireEvent.click(screen.getByTestId("refresh"));

    await waitFor(() => {
      expect(screen.getByTestId("notice").textContent).toContain(
        "sessions array",
      );
    });
  });
});
