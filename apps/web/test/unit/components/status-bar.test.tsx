import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { StatusBar } from "../../../src/features/terminal/components/StatusBar";

describe("StatusBar", () => {
  it("renders status details and handles toggle actions", () => {
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
          sessionDisplay: "session-a",
          attachMode: "control",
          reconnectAttempt: 3,
          queuedInputText: "1.0 KiB",
          droppedInputText: "0 B",
          outputText: "4.0 KiB",
          outputBytes: 4096,
          sessionButtonRef: createRef<HTMLDivElement>(),
        }}
        dispatch={dispatch}
      />,
    );

    fireEvent.click(screen.getByTestId("controls-toggle"));
    fireEvent.click(screen.getByTestId("session-menu-button"));

    expect(dispatch).toHaveBeenCalledWith({ type: "toggleControls" });
    expect(dispatch).toHaveBeenCalledWith({ type: "toggleSessionMenu" });
    expect(screen.getByTestId("status-label").textContent).toBe("Connected");
    expect(screen.getByTestId("output-value").getAttribute("data-bytes")).toBe(
      "4096",
    );
  });
});
