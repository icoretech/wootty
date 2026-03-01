import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toUserNotice } from "../../../../src/features/terminal/notifications/user-notice";
import type { Scheduler } from "../../../../src/features/terminal/platform/scheduler";
import { useSessionOrchestrator } from "../../../../src/features/terminal/session/application/session-orchestrator";
import {
  LAST_SESSION_STORAGE_KEY,
  SESSION_HISTORY_STORAGE_KEY,
} from "../../../../src/features/terminal/session/persistence/storage-keys";
import type { SessionsFetchResult } from "../../../../src/features/terminal/session/protocol/sessions-fetch-contract";
import { StorageDouble } from "../../../support/harness/storage-double";

type SessionProbeProps = {
  localStorageRef: Storage;
  sessionStorageRef: Storage;
  fetchSessions: (options?: {
    signal?: AbortSignal;
  }) => Promise<SessionsFetchResult>;
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
          void session.actions.refreshLiveSessions({
            trigger: "manual",
          });
        }}
      >
        refresh
      </button>
      <button
        type="button"
        data-testid="clear-notice"
        onClick={() => {
          session.actions.clearSessionNotice();
        }}
      >
        clear-notice
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

  it("surfaces bootstrap error notices with stable issue codes", async () => {
    const localStorageRef = new StorageDouble();
    const sessionStorageRef = new StorageDouble();
    const fetchSessions = vi.fn(async () => {
      return {
        ok: false,
        failure: {
          source: "fetch",
          reason: "bootstrap_error",
          issue: "invalid backend endpoint",
          issueCode: "socket_url_invalid_format",
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
      expect(screen.getByTestId("notice").textContent).toContain(
        "code=socket_url_invalid_format",
      );
    });
  });

  it("aborts stale refresh fetches when a newer refresh starts", async () => {
    const localStorageRef = new StorageDouble();
    const sessionStorageRef = new StorageDouble();
    const signals: AbortSignal[] = [];
    let callCount = 0;
    const fetchSessions = vi.fn(
      async (options?: {
        signal?: AbortSignal;
      }): Promise<SessionsFetchResult> => {
        const signal = options?.signal;
        if (signal) {
          signals.push(signal);
        }
        callCount += 1;
        if (callCount === 1) {
          return new Promise<SessionsFetchResult>((resolve) => {
            signal?.addEventListener(
              "abort",
              () => {
                resolve({
                  ok: false,
                  failure: {
                    source: "lifecycle",
                    reason: "request_aborted",
                  },
                });
              },
              { once: true },
            );
          });
        }
        return {
          ok: true,
          payload: {
            sessions: [],
          },
        };
      },
    );

    render(
      <SessionProbe
        localStorageRef={localStorageRef}
        sessionStorageRef={sessionStorageRef}
        fetchSessions={fetchSessions}
      />,
    );

    fireEvent.click(screen.getByTestId("refresh"));
    fireEvent.click(screen.getByTestId("refresh"));

    await waitFor(() => {
      expect(signals.length).toBe(2);
    });
    expect(signals[0]?.aborted).toBe(true);
  });

  it("can republish non-throttled refresh notices after clearing", async () => {
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
              canControl: true,
              watchers: 0,
              createdAtMs: Date.now(),
              lastActivityMs: Date.now(),
            },
            {
              id: "session-b",
              hasController: true,
              canControl: true,
              watchers: "oops",
              createdAtMs: Date.now(),
              lastActivityMs: Date.now(),
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
      expect(screen.getByTestId("notice").textContent).toContain(
        "Skipped 1 malformed session",
      );
    });

    fireEvent.click(screen.getByTestId("clear-notice"));
    expect(screen.getByTestId("notice").textContent).toBe("");

    fireEvent.click(screen.getByTestId("refresh"));
    await waitFor(() => {
      expect(screen.getByTestId("notice").textContent).toContain(
        "Skipped 1 malformed session",
      );
    });
  });
});
