import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  MockWebSocket,
  runtime,
  setupAppTestEnvironment,
} from "./support/app-harness";
import App from "../src/App";

describe("App integration - UI behavior", () => {
  beforeEach(() => {
    setupAppTestEnvironment();
  });

  it("updates font size controls and persists preference", async () => {
    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws = MockWebSocket.instances[0];
    await act(async () => {
      ws.triggerOpen();
      ws.triggerMessage({ type: "ready", sessionId: "session-a" });
    });

    expect(localStorage.getItem("wootty.fontSize")).toBeNull();
    expect(runtime.FakeTerminal.instances[0].options.fontSize).toBe(11);

    await act(async () => {
      fireEvent.click(screen.getByTestId("font-increase-button"));
    });

    expect(localStorage.getItem("wootty.fontSize")).toBe("12");
    expect(runtime.FakeTerminal.instances[0].options.fontSize).toBe(12);

    await act(async () => {
      fireEvent.click(screen.getByTestId("font-reset-button"));
    });

    expect(localStorage.getItem("wootty.fontSize")).toBe("11");
    expect(runtime.FakeTerminal.instances[0].options.fontSize).toBe(11);
  });

  it("announces reconnect status changes for assistive tech", async () => {
    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws = MockWebSocket.instances[0];
    await act(async () => {
      ws.triggerOpen();
      ws.triggerMessage({ type: "ready", sessionId: "session-a" });
    });

    expect(screen.getByTestId("status-announcement").textContent).toContain(
      "Connection status Connected.",
    );

    await act(async () => {
      ws.close();
    });

    await waitFor(() => {
      expect(screen.getByTestId("status-announcement").textContent).toContain(
        "Reconnecting. Attempt 1.",
      );
    });
  });
});
