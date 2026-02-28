import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  ACTIVE_SESSION_STORAGE_KEY,
  LAST_SESSION_STORAGE_KEY,
  SESSION_HISTORY_STORAGE_KEY,
} from "../src/lib/session-storage";
import {
  MockWebSocket,
  sentMessages,
  setupAppTestEnvironment,
} from "./support/app-harness";
import App from "../src/App";

let fetchMock: ReturnType<typeof setupAppTestEnvironment>;

describe("App integration - session menu", () => {
  beforeEach(() => {
    fetchMock = setupAppTestEnvironment();
  });

  it("resumes previous session only via explicit resume action", async () => {
    localStorage.setItem(LAST_SESSION_STORAGE_KEY, "session-old");

    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws1 = MockWebSocket.instances[0];
    await act(async () => {
      ws1.triggerOpen();
    });

    await waitFor(() => {
      const attachFirst = sentMessages(ws1).find(
        (message) => message.type === "attach",
      );
      expect(attachFirst).toBeDefined();
      expect(attachFirst).not.toHaveProperty("sessionId");
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-button"));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-resume-last"));
    });

    await waitFor(
      () => {
        expect(MockWebSocket.instances.length).toBe(2);
      },
      { timeout: 1_500 },
    );

    const ws2 = MockWebSocket.instances[1];
    await act(async () => {
      ws2.triggerOpen();
    });

    await waitFor(() => {
      const attachSecond = sentMessages(ws2).find(
        (message) => message.type === "attach",
      );
      expect(attachSecond).toBeDefined();
      expect(attachSecond?.sessionId).toBe("session-old");
    });
  });

  it("shows recent session ids as unavailable when not running", async () => {
    localStorage.setItem(LAST_SESSION_STORAGE_KEY, "session-old");
    localStorage.setItem(
      SESSION_HISTORY_STORAGE_KEY,
      JSON.stringify(["session-old"]),
    );

    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws = MockWebSocket.instances[0];
    await act(async () => {
      ws.triggerOpen();
      ws.triggerMessage({ type: "ready", sessionId: "session-current" });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-button"));
    });

    expect(screen.getByText("Live sessions")).toBeDefined();
    expect(screen.getByText("Recent session ids")).toBeDefined();
    expect(
      screen.getByTestId("session-menu-history-item").textContent,
    ).toContain("Unavailable");
  });

  it("surfaces a clear notice when a selected session is missing", async () => {
    localStorage.setItem(LAST_SESSION_STORAGE_KEY, "session-old");

    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws1 = MockWebSocket.instances[0];
    await act(async () => {
      ws1.triggerOpen();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-button"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("session-menu-resume-last")).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-resume-last"));
    });

    await waitFor(
      () => {
        expect(MockWebSocket.instances.length).toBe(2);
      },
      { timeout: 1_500 },
    );

    const ws2 = MockWebSocket.instances[1];
    await act(async () => {
      ws2.triggerOpen();
    });

    await act(async () => {
      ws2.triggerMessage({
        type: "error",
        code: "session_not_found",
        message: "Terminal attach failed: session not found",
      });
    });

    expect(screen.getByTestId("session-value").textContent).toContain(
      "pending",
    );
    expect(sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-button"));
    });

    expect(screen.getByTestId("session-menu-notice").textContent).toContain(
      "no longer running on the server",
    );
  });

  it("attaches in watch mode for sessions already controlled elsewhere", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        sessions: [
          {
            id: "session-watch",
            hasController: true,
            watchers: 0,
            createdAtMs: Date.now() - 10_000,
            lastActivityMs: Date.now() - 3_000,
            command: "sh",
          },
        ],
      }),
    });

    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws1 = MockWebSocket.instances[0];
    await act(async () => {
      ws1.triggerOpen();
      ws1.triggerMessage({ type: "ready", sessionId: "session-own" });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-button"));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-watch-item"));
    });

    await waitFor(
      () => {
        expect(MockWebSocket.instances.length).toBe(2);
      },
      { timeout: 1_500 },
    );

    const ws2 = MockWebSocket.instances[1];
    await act(async () => {
      ws2.triggerOpen();
    });

    await waitFor(() => {
      const attachSecond = sentMessages(ws2).find(
        (message) => message.type === "attach",
      );
      expect(attachSecond).toBeDefined();
      expect(attachSecond?.sessionId).toBe("session-watch");
      expect(attachSecond?.watch).toBe(true);
    });

    await act(async () => {
      ws2.triggerMessage({
        type: "ready",
        sessionId: "session-watch",
        readOnly: true,
      });
    });

    expect(screen.getByText("Read-only").textContent).toBe("Read-only");
  });
});
