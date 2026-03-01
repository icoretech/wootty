import { describe, expect, it } from "vitest";

import { deriveSessionCandidates } from "../../../src/features/terminal/session/domain/session-contract";
import { parseSessionsResponse } from "../../../src/features/terminal/session/protocol/sessions-payload-parser";

describe("session contract", () => {
  it("parses valid /api/sessions payload entries", () => {
    const parsed = parseSessionsResponse({
      sessions: [
        {
          id: "session-a",
          hasController: true,
          canControl: false,
          watchers: 2,
          createdAtMs: 100,
          lastActivityMs: 200,
          command: "bash",
        },
        {
          id: "session-b",
          hasController: "yes",
          canControl: true,
          watchers: 1,
          createdAtMs: 100,
          lastActivityMs: 120,
        },
        { id: "" },
        "invalid",
      ],
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error("expected valid parse result");
    }
    expect(parsed.sessions).toEqual([
      {
        id: "session-a",
        hasController: true,
        canControl: false,
        watchers: 2,
        createdAtMs: 100,
        lastActivityMs: 200,
        command: "bash",
      },
    ]);
    expect(parsed.invalidEntries).toBe(3);
  });

  it("marks malformed envelopes as errors", () => {
    const parsed = parseSessionsResponse({});
    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      throw new Error("expected malformed envelope");
    }
    expect(parsed.reason).toBe("missing_sessions_array");
  });

  it("derives live and history candidates with de-duplication", () => {
    const candidates = deriveSessionCandidates({
      liveSessions: [
        {
          id: "session-current",
          hasController: false,
          canControl: true,
          watchers: 0,
          createdAtMs: 0,
          lastActivityMs: 10,
          command: "sh",
        },
        {
          id: "session-watch",
          hasController: true,
          canControl: false,
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
