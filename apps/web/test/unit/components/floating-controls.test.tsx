import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FloatingControls } from "../../../src/features/terminal/components/FloatingControls";

describe("FloatingControls", () => {
  it("invokes action callbacks from control buttons", () => {
    const dispatch = vi.fn();

    render(
      <FloatingControls
        model={{
          controlsOpen: true,
          terminalReady: true,
          fontSize: 12,
          fontSizeMin: 11,
          fontSizeMax: 22,
          defaultFontSize: 11,
          isFullscreen: false,
        }}
        dispatch={dispatch}
      />,
    );

    fireEvent.click(screen.getByTestId("reconnect-button"));
    fireEvent.click(screen.getByTestId("clear-button"));
    fireEvent.click(screen.getByTestId("font-increase-button"));
    fireEvent.click(screen.getByTestId("font-decrease-button"));
    fireEvent.click(screen.getByTestId("font-reset-button"));
    fireEvent.click(screen.getByTestId("fullscreen-button"));

    expect(dispatch).toHaveBeenCalledWith({ type: "reconnect" });
    expect(dispatch).toHaveBeenCalledWith({ type: "clear" });
    expect(dispatch).toHaveBeenCalledWith({ type: "increaseFont" });
    expect(dispatch).toHaveBeenCalledWith({ type: "decreaseFont" });
    expect(dispatch).toHaveBeenCalledWith({ type: "resetFont" });
    expect(dispatch).toHaveBeenCalledWith({ type: "toggleFullscreen" });
  });
});
