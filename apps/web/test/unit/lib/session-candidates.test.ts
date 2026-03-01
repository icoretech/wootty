import { describe, expect, it } from "vitest";

import { deriveSessionCandidates } from "../../../src/features/terminal/session/domain/session-candidates";
import { parseSessionsResponse } from "../../../src/features/terminal/session/protocol/sessions-payload-parser";

describe("session candidates and payload contract", () => {
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
          watchers: 1.5,
          createdAtMs: 100,
          lastActivityMs: 120,
        },
        { id: "" },
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
    expect(parsed.invalidEntries).toBe(2);
  });

  it("marks malformed envelopes as errors", () => {
    const parsed = parseSessionsResponse({});
    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      throw new Error("expected malformed envelope");
    }
    expect(parsed.failure.reason).toBe("missing_sessions_array");
  });

  it("fails refresh parsing when all session entries are malformed", () => {
    const parsed = parseSessionsResponse({
      sessions: [
        {
          id: "session-a",
          hasController: "true",
          canControl: false,
          watchers: 0,
          createdAtMs: 100,
          lastActivityMs: 120,
        },
        {
          id: "session-b",
          hasController: true,
          canControl: true,
          watchers: 1.1,
          createdAtMs: 100,
          lastActivityMs: 200,
        },
      ],
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      throw new Error("expected malformed entries to fail parsing");
    }
    expect(parsed.failure.reason).toBe("all_sessions_invalid");
    expect(parsed.failure).toMatchObject({
      invalidEntries: 2,
      totalEntries: 2,
    });
  });

  it("fails parsing when malformed sessions exceed the tolerated ratio", () => {
    const parsed = parseSessionsResponse({
      sessions: [
        {
          id: "session-a",
          hasController: true,
          canControl: true,
          watchers: 1,
          createdAtMs: 100,
          lastActivityMs: 200,
        },
        {
          id: "session-b",
          hasController: true,
          canControl: true,
          watchers: 2.2,
          createdAtMs: 100,
          lastActivityMs: 200,
        },
        {
          id: "session-c",
          hasController: true,
          canControl: "yes",
          watchers: 1,
          createdAtMs: 100,
          lastActivityMs: 200,
        },
        {
          id: "session-d",
          hasController: true,
          canControl: false,
          watchers: 0,
          createdAtMs: 100,
          lastActivityMs: 200,
        },
      ],
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      throw new Error("expected excessive malformed entries to fail parsing");
    }
    expect(parsed.failure.reason).toBe("too_many_invalid_sessions");
    expect(parsed.failure).toMatchObject({
      invalidEntries: 2,
      totalEntries: 4,
    });
  });

  it("rejects session entries that only inherit required fields via prototype chain", () => {
    const inheritedEntry = Object.create({
      id: "session-inherited",
      hasController: true,
      canControl: true,
      watchers: 1,
      createdAtMs: 100,
      lastActivityMs: 200,
    });

    const parsed = parseSessionsResponse({
      sessions: [inheritedEntry],
    });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      throw new Error("expected inherited required fields to be rejected");
    }
    expect(parsed.failure.reason).toBe("all_sessions_invalid");
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
