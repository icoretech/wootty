import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SessionMenu } from "../src/features/terminal/components/SessionMenu";

describe("SessionMenu", () => {
  it("renders session entries and dispatches actions", () => {
    const onStartFreshSession = vi.fn();
    const onResumePreviousSession = vi.fn();
    const onResumeSession = vi.fn();

    render(
      <SessionMenu
        open
        terminalReady
        lastSessionId="session-last"
        sessionNotice="session warning"
        liveSessionCandidates={[
          {
            id: "session-live",
            action: "watch",
            command: "sh",
            watchers: 2,
            lastActivityMs: Date.now(),
          },
        ]}
        historySessionCandidates={["session-old"]}
        onStartFreshSession={onStartFreshSession}
        onResumePreviousSession={onResumePreviousSession}
        onResumeSession={onResumeSession}
        formatSessionId={(value) => value}
        formatAgeLabel={() => "1s ago"}
      />,
    );

    fireEvent.click(screen.getByTestId("session-menu-new"));
    fireEvent.click(screen.getByTestId("session-menu-resume-last"));
    fireEvent.click(screen.getByTestId("session-menu-watch-item"));

    expect(onStartFreshSession).toHaveBeenCalledTimes(1);
    expect(onResumePreviousSession).toHaveBeenCalledTimes(1);
    expect(onResumeSession).toHaveBeenCalledWith("session-live", "watch");
    expect(screen.getByTestId("session-menu-history-item").textContent).toContain(
      "Unavailable",
    );
  });
});
