import { describe, expect, it } from "vitest";

import { presentSessionCandidate } from "../../src/features/terminal/presentation/session-menu-presenter";

describe("session menu presenter", () => {
  it("builds watch rows with watcher count metadata", () => {
    const row = presentSessionCandidate(
      {
        id: "session-watch",
        mode: "watch",
        command: "sh",
        watchers: 2,
        lastActivityMs: 1_700_000_000_000,
      },
      () => "10s ago",
    );

    expect(row.actionLabel).toBe("Watch");
    expect(row.secondaryText).toContain("2 watchers");
  });

  it("builds control rows with default command label", () => {
    const row = presentSessionCandidate(
      {
        id: "session-control",
        mode: "control",
        command: null,
        watchers: 0,
        lastActivityMs: 1_700_000_000_000,
      },
      () => "active recently",
    );

    expect(row.actionLabel).toBe("Resume");
    expect(row.secondaryText).toContain("interactive shell");
  });
});
