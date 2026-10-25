import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AboutDialog } from "../../../src/features/terminal/components/AboutDialog";

const defaultSession = {
  id: "abc-123",
  name: null,
  command: "bash",
  attachMode: "control" as const,
  status: "Connected",
  watchers: 0,
};

describe("AboutDialog", () => {
  it("opens a native modal and provides a close button", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <AboutDialog open={true} onClose={onClose} session={defaultSession} />,
    );
    const dialog = screen.getByRole("dialog", { name: "About WooTTY" });
    expect(dialog).toBeInstanceOf(HTMLDialogElement);
    expect(dialog.hasAttribute("open")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Close about dialog" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(
      <AboutDialog open={false} onClose={onClose} session={defaultSession} />,
    );
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("renders version, shortcuts, session info, and links when open", () => {
    render(
      <AboutDialog open={true} onClose={vi.fn()} session={defaultSession} />,
    );

    expect(screen.getByTestId("about-dialog")).toBeTruthy();
    expect(screen.getByText("WooTTY")).toBeTruthy();
    expect(screen.getByText("Session")).toBeTruthy();
    expect(screen.getByText("Shortcuts")).toBeTruthy();
    expect(screen.getByText("GitHub")).toBeTruthy();
    expect(screen.getByText("MIT")).toBeTruthy();
    expect(screen.getByText("Reconnect")).toBeTruthy();
  });

  it("renders nothing when closed", () => {
    render(
      <AboutDialog open={false} onClose={vi.fn()} session={defaultSession} />,
    );

    expect(screen.queryByTestId("about-dialog")).toBeNull();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <AboutDialog open={true} onClose={onClose} session={defaultSession} />,
    );

    fireEvent(
      screen.getByRole("dialog", { name: "About WooTTY" }),
      new Event("cancel", { bubbles: false, cancelable: true }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <AboutDialog open={true} onClose={onClose} session={defaultSession} />,
    );

    fireEvent.click(screen.getByTestId("about-backdrop"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows session name when available", () => {
    render(
      <AboutDialog
        open={true}
        onClose={vi.fn()}
        session={{ ...defaultSession, name: "deploy-prod" }}
      />,
    );

    expect(screen.getByText("deploy-prod")).toBeTruthy();
  });

  it("shows no active session when id is null", () => {
    render(
      <AboutDialog
        open={true}
        onClose={vi.fn()}
        session={{ ...defaultSession, id: null }}
      />,
    );

    expect(screen.getByText("no active session")).toBeTruthy();
  });
});
