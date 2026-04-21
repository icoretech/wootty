import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { StatusBar } from "../../../src/features/terminal/components/StatusBar";

describe("StatusBar", () => {
  it("renders status details, handles toggle actions, and copies session names", async () => {
    const dispatch = vi.fn();
    const writeText = vi.fn<() => Promise<void>>().mockResolvedValue();
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    render(
      <StatusBar
        model={{
          controlsOpen: true,
          sessionMenuOpen: false,
          status: "connected",
          latencyTone: "good",
          statusText: "Connected",
          latencyText: "12ms",
          sessionName: "session-abcdefghijklmno",
          sessionDisplay: "session-…lmno",
          attachMode: "control",
          reconnectAttempt: 3,
          queuedInputText: "1.0 KiB",
          droppedInputText: "0 B",
          canDownloadTranscript: true,
          outputText: "4.0 KiB",
          outputBytes: 4096,
        }}
        sessionButtonRef={createRef<HTMLDivElement>()}
        dispatch={dispatch}
      />,
    );

    fireEvent.click(screen.getByTestId("controls-toggle"));
    fireEvent.click(screen.getByTestId("session-menu-button"));
    fireEvent.click(screen.getByTestId("session-copy-button"));
    fireEvent.click(screen.getByTestId("session-download-button"));

    expect(dispatch).toHaveBeenCalledWith({ type: "toggleControls" });
    expect(dispatch).toHaveBeenCalledWith({ type: "toggleSessionMenu" });
    expect(dispatch).toHaveBeenCalledWith({ type: "downloadTranscript" });
    expect(screen.getByTestId("status-label").textContent).toBe("Connected");
    expect(screen.getByTestId("output-value").getAttribute("data-bytes")).toBe(
      "4096",
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("session-abcdefghijklmno");
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("session-copy-button").getAttribute("data-copied"),
      ).toBe("true");
      expect(
        screen.getByTestId("session-copy-button").getAttribute("aria-label"),
      ).toBe("Current session name copied");
    });
  });

  it("keeps copy action disabled without an active session", () => {
    const dispatch = vi.fn();

    render(
      <StatusBar
        model={{
          controlsOpen: true,
          sessionMenuOpen: false,
          status: "connected",
          latencyTone: "good",
          statusText: "Connected",
          latencyText: "12ms",
          sessionName: null,
          sessionDisplay: "pending",
          attachMode: "control",
          reconnectAttempt: 3,
          queuedInputText: "1.0 KiB",
          droppedInputText: "0 B",
          canDownloadTranscript: false,
          outputText: "4.0 KiB",
          outputBytes: 4096,
        }}
        sessionButtonRef={createRef<HTMLDivElement>()}
        dispatch={dispatch}
      />,
    );

    expect(
      screen.getByTestId("session-copy-button").hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByTestId("session-download-button").hasAttribute("disabled"),
    ).toBe(true);
  });
});
