import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionMenu } from "../../../src/features/terminal/components/SessionMenu";

describe("SessionMenu", () => {
  it("renders session entries and dispatches actions", () => {
    const dispatch = vi.fn();

    render(
      <SessionMenu
        model={{
          sessionMenuOpen: true,
          terminalReady: true,
          canResumeLast: true,
          sessionNotice: "session warning",
          liveRows: [
            {
              id: "session-live",
              mode: "watch",
              primaryText: "session-live",
              secondaryText: "2 watchers",
              actionLabel: "Watch",
            },
          ],
          historyRows: [{ id: "session-old", primaryText: "session-old" }],
        }}
        dispatch={dispatch}
      />,
    );

    fireEvent.click(screen.getByTestId("session-menu-new"));
    fireEvent.click(screen.getByTestId("session-menu-resume-last"));
    fireEvent.click(screen.getByTestId("session-menu-watch-item"));

    expect(dispatch).toHaveBeenCalledWith({ type: "startFresh" });
    expect(dispatch).toHaveBeenCalledWith({ type: "resumeLast" });
    expect(dispatch).toHaveBeenCalledWith({
      type: "attach",
      sessionId: "session-live",
      mode: "watch",
    });
    expect(
      screen.getByTestId("session-menu-history-item").textContent,
    ).toContain("Unavailable");
  });
});
