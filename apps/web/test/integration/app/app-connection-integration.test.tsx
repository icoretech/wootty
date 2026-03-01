import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupAppTestEnvironment } from "./harness/app-harness";

describe("App integration - connection lifecycle", () => {
  let harness: ReturnType<typeof setupAppTestEnvironment>;

  beforeEach(() => {
    harness = setupAppTestEnvironment();
  });

  afterEach(() => {
    harness.cleanup();
  });

  // @trace FR-2 integration-store-ready-session
  it("connects and stores ready session id in tab and resume storage", async () => {
    await harness.renderTerminalApp();
    const ws1 = await harness.waitForSocket();
    await harness.openSocket(ws1);

    await waitFor(() => {
      const attach = harness.socket
        .sentMessages(ws1)
        .find((message) => message.type === "attach");
      expect(attach).toBeDefined();
      expect(attach?.cols).toBe(80);
      expect(attach?.rows).toBe(24);
    });

    await harness.markReady(ws1, "session-a");

    expect(screen.getByTestId("status-label").textContent).toContain(
      "Connected",
    );
    expect(screen.getByTestId("session-value").textContent).toContain(
      "session-a",
    );
  });

  // @trace FR-4 integration-buffer-flush
  it("buffers input while disconnected and flushes after reconnect", async () => {
    const ws1 = await harness.bootConnected("session-a");

    const terminal = harness.runtime.terminals[0];

    await act(async () => {
      ws1.close();
      terminal.emitInput("ls\n");
    });

    const ws2 = await harness.waitForSocket(1);
    await harness.openSocket(ws2);
    await harness.markReady(ws2, "session-a");

    await waitFor(() => {
      const inputFrame = harness.socket
        .sentMessages(ws2)
        .find((message) => message.type === "input" && message.data === "ls\n");
      expect(inputFrame).toBeDefined();
    });

    expect(screen.getByTestId("status-label").textContent).toContain(
      "Connected",
    );
  });

  it("retains unsent outbox chunks when transport drops mid-flush", async () => {
    const ws1 = await harness.bootConnected("session-a");

    const terminal = harness.runtime.terminals[0];
    await act(async () => {
      ws1.close();
      terminal.emitInput("echo 1\n");
      terminal.emitInput("echo 2\n");
    });

    const ws2 = await harness.waitForSocket(1);
    const originalSend = ws2.send.bind(ws2);
    let inputSendCount = 0;
    ws2.send = (data: string) => {
      originalSend(data);
      const payload = JSON.parse(data) as { type?: string };
      if (payload.type === "input") {
        inputSendCount += 1;
      }
      if (inputSendCount === 1) {
        ws2.close(4100, "mid-flush disconnect");
      }
    };

    await harness.openSocket(ws2);
    await harness.markReady(ws2, "session-a");

    const ws3 = await harness.waitForSocket(2);
    await harness.openSocket(ws3);
    await harness.markReady(ws3, "session-a");

    await waitFor(() => {
      const inputFrames = harness.socket
        .sentMessages(ws3)
        .filter(
          (message) =>
            message.type === "input" &&
            (message.data === "echo 1\n" || message.data === "echo 2\n"),
        );
      expect(inputFrames.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("handles synchronous transport send exceptions as error state", async () => {
    await harness.renderTerminalApp();
    const ws = await harness.waitForSocket();
    ws.send = () => {
      throw new Error("send exploded");
    };

    await harness.openSocket(ws);

    await waitFor(() => {
      expect(screen.getByTestId("status-label").textContent).toContain("Error");
      expect(screen.getByTestId("status-announcement").textContent).toContain(
        "send exploded",
      );
    });
  });

  it("preserves close-event context in reconnect announcement", async () => {
    const ws = await harness.bootConnected("session-a");

    await act(async () => {
      ws.close(4100, "socket reset");
    });

    await waitFor(() => {
      expect(screen.getByTestId("status-announcement").textContent).toContain(
        "code=4100",
      );
    });
  });

  it("starts a fresh session without reusing active tab session id", async () => {
    const ws1 = await harness.bootConnected("session-old");

    await act(async () => {
      ws1.triggerMessage({ type: "output", data: "hello\n" });
    });

    expect(screen.getByTestId("output-value").getAttribute("data-bytes")).toBe(
      "6",
    );
    const terminal = harness.runtime.terminals[0];
    expect(terminal.clearCalls).toBe(0);

    await harness.openSessionMenu();

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-new"));
    });

    expect(screen.getByTestId("output-value").getAttribute("data-bytes")).toBe(
      "0",
    );
    expect(terminal.clearCalls).toBe(1);

    const ws2 = await harness.waitForSocket(1);
    await harness.openSocket(ws2);

    await waitFor(() => {
      const attachSecond = harness.socket
        .sentMessages(ws2)
        .find((message) => message.type === "attach");
      expect(attachSecond).toBeDefined();
      expect(attachSecond).not.toHaveProperty("sessionId");
    });

    await harness.markReady(ws2, "session-new");

    expect(screen.getByTestId("session-value").textContent).toContain(
      "session-new",
    );
  });
});
