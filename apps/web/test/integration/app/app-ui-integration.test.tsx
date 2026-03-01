import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupAppTestEnvironment } from "./harness/app-harness";

describe("App integration - UI behavior", () => {
  let harness: ReturnType<typeof setupAppTestEnvironment>;

  beforeEach(() => {
    harness = setupAppTestEnvironment();
  });

  afterEach(() => {
    harness.cleanup();
  });

  // @trace FR-7 ui-font-preference
  it("updates font size controls and persists preference", async () => {
    await harness.bootConnected("session-a");

    expect(localStorage.getItem("wootty.fontSize")).toBeNull();
    expect(harness.runtime.terminals[0]?.options.fontSize).toBe(11);

    await act(async () => {
      fireEvent.click(screen.getByTestId("font-increase-button"));
    });

    expect(localStorage.getItem("wootty.fontSize")).toBe("12");
    expect(harness.runtime.terminals[0]?.options.fontSize).toBe(12);

    await act(async () => {
      fireEvent.click(screen.getByTestId("font-reset-button"));
    });

    expect(localStorage.getItem("wootty.fontSize")).toBe("11");
    expect(harness.runtime.terminals[0]?.options.fontSize).toBe(11);
  });

  // @trace FR-8 ui-reconnect-a11y
  it("announces reconnect status changes for assistive tech", async () => {
    const ws = await harness.bootConnected("session-a");

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

  it("publishes a notice when fullscreen toggling is rejected", async () => {
    const originalRequestFullscreen = HTMLElement.prototype.requestFullscreen;
    const requestFullscreenMock = vi.fn(async () => {
      throw new Error("denied");
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreenMock,
    });

    try {
      await harness.bootConnected("session-a");

      await act(async () => {
        fireEvent.click(screen.getByTestId("fullscreen-button"));
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("session-menu-button"));
      });

      await waitFor(() => {
        expect(screen.getByTestId("session-menu-notice").textContent).toContain(
          "Unable to toggle fullscreen mode",
        );
      });
    } finally {
      Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
        configurable: true,
        value: originalRequestFullscreen,
      });
    }
  });
});
