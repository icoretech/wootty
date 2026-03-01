import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SESSION_SNAPSHOT_OPTIONAL_FIELDS,
  SESSION_SNAPSHOT_REQUIRED_FIELDS,
  SESSIONS_ENVELOPE_FIELD,
} from "../../../src/features/terminal/protocol/sessions-wire-schema";

type SessionsContract = {
  envelope_field: string;
  snapshot: {
    required: string[];
    optional: string[];
  };
};

function loadSessionsContract(): SessionsContract {
  const candidates = [
    resolve(process.cwd(), "contracts/sessions-contract.json"),
    resolve(process.cwd(), "../contracts/sessions-contract.json"),
    resolve(process.cwd(), "../../contracts/sessions-contract.json"),
  ];
  const contractPath = candidates.find((path) => existsSync(path));
  if (!contractPath) {
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
});
