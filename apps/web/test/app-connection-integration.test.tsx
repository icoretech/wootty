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
} from "../src/lib/session-storage";
import {
  MockWebSocket,
  runtime,
  sentMessages,
  setupAppTestEnvironment,
} from "./support/app-harness";
import App from "../src/App";

describe("App integration - connection lifecycle", () => {
  beforeEach(() => {
    setupAppTestEnvironment();
  });

  it("connects and stores ready session id in tab and resume storage", async () => {
    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws1 = MockWebSocket.instances[0];

    await act(async () => {
      ws1.triggerOpen();
    });

    await waitFor(() => {
      const attach = sentMessages(ws1).find(
        (message) => message.type === "attach",
      );
      expect(attach).toBeDefined();
      expect(attach?.cols).toBe(80);
      expect(attach?.rows).toBe(24);
    });

    await act(async () => {
      ws1.triggerMessage({ type: "ready", sessionId: "session-a" });
    });

    expect(screen.getByTestId("status-label").textContent).toContain(
      "Connected",
    );
    expect(screen.getByTestId("session-value").textContent).toContain(
      "session-a",
    );
    expect(localStorage.getItem(LAST_SESSION_STORAGE_KEY)).toBe("session-a");
    expect(sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)).toBe(
      "session-a",
    );
  });

  it("buffers input while disconnected and flushes after reconnect", async () => {
    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws1 = MockWebSocket.instances[0];

    await act(async () => {
      ws1.triggerOpen();
      ws1.triggerMessage({ type: "ready", sessionId: "session-a" });
    });

    const terminal = runtime.FakeTerminal.instances[0];

    await act(async () => {
      ws1.close();
      terminal.emitInput("ls\n");
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
      ws2.triggerMessage({ type: "ready", sessionId: "session-a" });
    });

    await waitFor(() => {
      const inputFrame = sentMessages(ws2).find(
        (message) => message.type === "input" && message.data === "ls\n",
      );
      expect(inputFrame).toBeDefined();
    });

    expect(screen.getByTestId("status-label").textContent).toContain(
      "Connected",
    );
  });

  it("starts a fresh session without reusing active tab session id", async () => {
    sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, "session-old");
    localStorage.setItem(LAST_SESSION_STORAGE_KEY, "session-old");

    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws1 = MockWebSocket.instances[0];

    await act(async () => {
      ws1.triggerOpen();
      ws1.triggerMessage({ type: "ready", sessionId: "session-old" });
      ws1.triggerMessage({ type: "output", data: "hello\n" });
    });

    expect(screen.getByTestId("output-value").getAttribute("data-bytes")).toBe(
      "6",
    );
    const terminal = runtime.FakeTerminal.instances[0];
    expect(terminal.clearCalls).toBe(0);

    const attachFirst = sentMessages(ws1).find(
      (message) => message.type === "attach",
    );
    expect(attachFirst?.sessionId).toBe("session-old");

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-button"));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-new"));
    });

    expect(screen.getByTestId("output-value").getAttribute("data-bytes")).toBe(
      "0",
    );
    expect(terminal.clearCalls).toBe(1);

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
      expect(attachSecond).not.toHaveProperty("sessionId");
    });

    await act(async () => {
      ws2.triggerMessage({ type: "ready", sessionId: "session-new" });
    });

    expect(screen.getByTestId("session-value").textContent).toContain(
      "session-new",
    );
    expect(localStorage.getItem(LAST_SESSION_STORAGE_KEY)).toBe("session-new");
    expect(sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)).toBe(
      "session-new",
    );
  });
});
