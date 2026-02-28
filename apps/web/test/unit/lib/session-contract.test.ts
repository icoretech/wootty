import { describe, expect, it } from "vitest";

import {
  deriveSessionCandidates,
  parseSessionsResponse,
} from "../../../src/features/terminal/session/domain/session-contract";

describe("session contract", () => {
  it("parses valid /api/sessions payload entries", () => {
    const parsed = parseSessionsResponse({
      sessions: [
        {
          id: "session-a",
          hasController: true,
          watchers: 2,
          createdAtMs: 100,
          lastActivityMs: 200,
          command: "bash",
        },
        { id: "" },
        "invalid",
      ],
    });

    expect(parsed.sessions).toEqual([
      {
        id: "session-a",
        hasController: true,
        watchers: 2,
        createdAtMs: 100,
        lastActivityMs: 200,
        command: "bash",
      },
    ]);
    expect(parsed.invalidEntries).toBe(2);
  });

  it("derives live and history candidates with de-duplication", () => {
    const candidates = deriveSessionCandidates({
      liveSessions: [
        {
          id: "session-current",
          hasController: false,
          watchers: 0,
          createdAtMs: 0,
          lastActivityMs: 10,
          command: "sh",
        },
        {
          id: "session-watch",
          hasController: true,
          watchers: 1,
          createdAtMs: 0,
          lastActivityMs: 20,
          command: "zsh",
        },
      ],
      currentSessionId: "session-current",
      sessionHistoryIds: ["session-watch", "session-history"],
      lastSessionId: "session-last",
    });

    expect(candidates.liveSessionCandidates).toEqual([
      {
        id: "session-watch",
        mode: "watch",
        command: "zsh",
        watchers: 1,
        lastActivityMs: 20,
      },
    ]);
    expect(candidates.historySessionCandidates).toEqual(["session-history"]);
  });
});
