import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SESSION_SNAPSHOT_OPTIONAL_FIELDS,
  SESSION_SNAPSHOT_REQUIRED_FIELDS,
  SESSIONS_ENVELOPE_FIELD,
} from "../../../src/features/terminal/protocol/generated-wire-contract";
import { parseSessionsResponse } from "../../../src/features/terminal/session/protocol/sessions-payload-parser";

type SessionsContract = {
  envelope_field: string;
  snapshot: {
    required: string[];
    optional: string[];
  };
};

const compareLexicographically = (left: string, right: string) =>
  left.localeCompare(right);

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

function loadSessionsContract(): SessionsContract {
  const contractPath = resolve(REPO_ROOT, "contracts/sessions-contract.json");
  if (!existsSync(contractPath)) {
    throw new Error("Unable to locate contracts/sessions-contract.json");
  }
  const raw = readFileSync(contractPath, "utf8");
  return JSON.parse(raw) as SessionsContract;
}

describe("sessions contract parity", () => {
  it("keeps sessions envelope and snapshot fields aligned with contract file", () => {
    const contract = loadSessionsContract();
    expect(contract.envelope_field).toBe(SESSIONS_ENVELOPE_FIELD);
    expect(contract.snapshot.required).toEqual(
      Array.from(SESSION_SNAPSHOT_REQUIRED_FIELDS),
    );
    expect(contract.snapshot.optional).toEqual(
      Array.from(SESSION_SNAPSHOT_OPTIONAL_FIELDS),
    );
  });

  it("projects parser output with the exact required/optional session snapshot keys", () => {
    const parsed = parseSessionsResponse({
      sessions: [
        {
          id: "session-a",
          hasController: true,
          canControl: false,
          watchers: 1,
          createdAtMs: 100,
          lastActivityMs: 120,
          command: "bash",
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error("expected valid session payload");
    }
    const snapshot = parsed.sessions[0];
    const expectedKeys = [
      ...SESSION_SNAPSHOT_REQUIRED_FIELDS,
      ...SESSION_SNAPSHOT_OPTIONAL_FIELDS,
    ].sort(compareLexicographically);
    expect(Object.keys(snapshot).sort(compareLexicographically)).toEqual(
      expectedKeys,
    );
  });
});
