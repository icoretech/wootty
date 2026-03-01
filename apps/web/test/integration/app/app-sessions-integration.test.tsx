import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TERMINAL_SERVER_ERROR_CODE } from "../../../src/features/terminal/protocol/server-error-codes";
import { TERMINAL_WIRE_CONTRACT_VERSION } from "../../../src/features/terminal/protocol/terminal-wire-schema";
import { setupAppTestEnvironment } from "./harness/app-harness";

let harness: ReturnType<typeof setupAppTestEnvironment>;

describe("App integration - session menu", () => {
  beforeEach(() => {
    harness = setupAppTestEnvironment();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it("resumes previous session only via explicit resume action", async () => {
    harness.seedLastSession("session-old");

    await harness.renderTerminalApp();
    const ws1 = await harness.waitForSocket();
    await harness.openSocket(ws1);

    await waitFor(() => {
      const attachFirst = harness.socket
        .sentMessages(ws1)
        .find((message) => message.type === "attach");
      expect(attachFirst).toBeDefined();
      expect(attachFirst).not.toHaveProperty("sessionId");
    });

    await harness.openSessionMenu();

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-resume-last"));
    });

    const ws2 = await harness.waitForSocket(1);
    await harness.openSocket(ws2);

    await waitFor(() => {
      const attachSecond = harness.socket
        .sentMessages(ws2)
        .find((message) => message.type === "attach");
      expect(attachSecond).toBeDefined();
      expect(attachSecond?.sessionId).toBe("session-old");
    });
  });

  it("shows recent session ids as unavailable when not running", async () => {
    harness.seedLastSession("session-old");
    harness.seedSessionHistory(["session-old"]);

    await harness.bootConnected("session-current");
    await harness.openSessionMenu();

    expect(screen.getByText("Live sessions")).toBeDefined();
    expect(screen.getByText("Recent session ids")).toBeDefined();
    expect(
      screen.getByTestId("session-menu-history-item").textContent,
    ).toContain("Unavailable");
  });

  it("surfaces a clear notice when a selected session is missing", async () => {
    harness.seedLastSession("session-old");

    await harness.renderTerminalApp();
    const ws1 = await harness.waitForSocket();
    await harness.openSocket(ws1);
    await harness.openSessionMenu();

    await waitFor(() => {
      expect(screen.getByTestId("session-menu-resume-last")).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-resume-last"));
    });

    const ws2 = await harness.waitForSocket(1);
    await harness.openSocket(ws2);

    await act(async () => {
      ws2.triggerMessage({
        type: "error",
        code: TERMINAL_SERVER_ERROR_CODE.SESSION_NOT_FOUND,
        message: "Terminal attach failed: session not found",
      });
    });

    expect(screen.getByTestId("session-value").textContent).toContain(
      "pending",
    );

    await harness.openSessionMenu();

    expect(screen.getByTestId("session-menu-notice").textContent).toContain(
      "no longer running on the server",
    );
  });

  it("downgrades to watch mode when server denies control attach", async () => {
    harness.seedLastSession("session-protected");
    await harness.renderTerminalApp();
    const ws1 = await harness.waitForSocket();
    await harness.openSocket(ws1);
    await harness.openSessionMenu();
    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-resume-last"));
    });
    const ws2 = await harness.waitForSocket(1);
    await act(async () => {
      ws2.triggerOpen();
      ws2.triggerMessage({
        type: "error",
        code: TERMINAL_SERVER_ERROR_CODE.ATTACH_FORBIDDEN,
        message: "attach denied",
      });
    });

    expect(screen.getByText("Read-only").textContent).toBe("Read-only");

    await harness.openSessionMenu();

    expect(screen.getByTestId("session-menu-notice").textContent).toContain(
      "denied control attach",
    );
  });

  it("attaches in watch mode for sessions already controlled elsewhere", async () => {
    harness.setFetchResponse({
      sessions: [
        {
          id: "session-watch",
          hasController: true,
          canControl: false,
          watchers: 0,
          createdAtMs: Date.now() - 10_000,
          lastActivityMs: Date.now() - 3_000,
          command: "sh",
        },
      ],
    });

    await harness.bootConnected("session-own");
    await harness.openSessionMenu();

    await waitFor(() => {
      expect(harness.fetchMock).toHaveBeenCalled();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-watch-item"));
    });

    const ws2 = await harness.waitForSocket(1);
    await harness.openSocket(ws2);

    await waitFor(() => {
      const attachSecond = harness.socket
        .sentMessages(ws2)
        .find((message) => message.type === "attach");
      expect(attachSecond).toBeDefined();
      expect(attachSecond?.sessionId).toBe("session-watch");
      expect(attachSecond?.watch).toBe(true);
    });

    await act(async () => {
      ws2.triggerMessage({
        type: "ready",
        version: TERMINAL_WIRE_CONTRACT_VERSION,
        sessionId: "session-watch",
        readOnly: true,
      });
    });

    expect(screen.getByText("Read-only").textContent).toBe("Read-only");
  });

  it("shows an HTTP-context notice when live session refresh returns non-ok", async () => {
    harness.setFetchResponse({ ok: false, status: 503 });

    await harness.bootConnected("session-own");
    await harness.openSessionMenu();

    await waitFor(() => {
      expect(screen.getByTestId("session-menu-notice").textContent).toContain(
        "HTTP 503",
      );
    });
  });

  it("shows a refresh notice when live session refresh throws", async () => {
    harness.setFetchError(new Error("network down"));

    await harness.bootConnected("session-own");
    await harness.openSessionMenu();

    await waitFor(() => {
      expect(screen.getByTestId("session-menu-notice").textContent).toContain(
        "Unable to refresh live sessions",
      );
    });
  });
});
