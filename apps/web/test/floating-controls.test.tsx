import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FloatingControls } from "../src/features/terminal/components/FloatingControls";

describe("FloatingControls", () => {
  it("invokes action callbacks from control buttons", () => {
    const onReconnect = vi.fn();
    const onClearTerminal = vi.fn();
    const onApplyFontSize = vi.fn();
    const onToggleFullscreen = vi.fn(async () => undefined);

    render(
      <FloatingControls
        controlsOpen
        terminalReady
        fontSize={12}
        fontSizeMin={11}
        fontSizeMax={22}
        defaultFontSize={11}
        isFullscreen={false}
        onReconnect={onReconnect}
        onClearTerminal={onClearTerminal}
        onApplyFontSize={onApplyFontSize}
        onToggleFullscreen={onToggleFullscreen}
      />,
    );

    fireEvent.click(screen.getByTestId("reconnect-button"));
    fireEvent.click(screen.getByTestId("clear-button"));
    fireEvent.click(screen.getByTestId("font-increase-button"));
    fireEvent.click(screen.getByTestId("font-decrease-button"));
    fireEvent.click(screen.getByTestId("font-reset-button"));
    fireEvent.click(screen.getByTestId("fullscreen-button"));

    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(onClearTerminal).toHaveBeenCalledTimes(1);
    expect(onApplyFontSize).toHaveBeenCalledWith(13);
    expect(onApplyFontSize).toHaveBeenCalledWith(11);
    expect(onApplyFontSize).toHaveBeenCalledWith(11);
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
  });
});
