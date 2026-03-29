import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShortcutsPanel } from "../../../src/features/terminal/components/ShortcutsPanel";

describe("ShortcutsPanel", () => {
  it("renders all shortcut rows when open", () => {
    render(<ShortcutsPanel open={true} onClose={vi.fn()} />);

    expect(screen.getByTestId("shortcuts-panel")).toBeTruthy();
    expect(screen.getByText("Reconnect")).toBeTruthy();
    expect(screen.getByText("Clear terminal")).toBeTruthy();
    expect(screen.getByText("Decrease font size")).toBeTruthy();
    expect(screen.getByText("Increase font size")).toBeTruthy();
    expect(screen.getByText("Reset font size")).toBeTruthy();
    expect(screen.getByText("Toggle fullscreen")).toBeTruthy();
    expect(screen.getByText("Toggle controls")).toBeTruthy();
    expect(screen.getAllByText("Keyboard shortcuts")).toHaveLength(2);
  });

  it("renders nothing when closed", () => {
    render(<ShortcutsPanel open={false} onClose={vi.fn()} />);

    expect(screen.queryByTestId("shortcuts-panel")).toBeNull();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<ShortcutsPanel open={true} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<ShortcutsPanel open={true} onClose={onClose} />);

    fireEvent.click(screen.getByTestId("shortcuts-backdrop"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when panel content is clicked", () => {
    const onClose = vi.fn();
    render(<ShortcutsPanel open={true} onClose={onClose} />);

    fireEvent.click(screen.getByTestId("shortcuts-panel"));

    expect(onClose).not.toHaveBeenCalled();
  });
});
