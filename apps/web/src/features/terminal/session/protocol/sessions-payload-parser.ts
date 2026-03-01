import type { SessionSnapshot } from "../../contracts/session";
import {
  SESSION_SNAPSHOT_REQUIRED_FIELDS,
  SESSIONS_ENVELOPE_FIELD,
} from "../../protocol/generated-wire-contract";
import type { SessionRefreshFailure } from "./session-refresh-failure-contract";
import { evaluateSessionsParsePolicy } from "./sessions-parse-policy";

type SessionParseResult =
  | {
      readonly ok: true;
      readonly sessions: SessionSnapshot[];
      readonly invalidEntries: number;
    }
  | {
      readonly ok: false;
      readonly failure: Extract<SessionRefreshFailure, { source: "parse" }>;
    };

function parseNonNegativeInteger(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value)
  ) {
    return null;
  }
  if (value < 0) {
    return null;
  }
  return value;
}

function hasRequiredSessionFields(record: Record<string, unknown>): boolean {
  return SESSION_SNAPSHOT_REQUIRED_FIELDS.every((field) => field in record);
}

function parseSessionSnapshot(entry: unknown): SessionSnapshot | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as Record<string, unknown>;
  if (!hasRequiredSessionFields(record)) {
    return null;
  }
  if (typeof record.id !== "string" || record.id.length === 0) {
    return null;
  }
  if (
    typeof record.hasController !== "boolean" ||
    typeof record.canControl !== "boolean"
  ) {
    return null;
  }

  const watchers = parseNonNegativeInteger(record.watchers);
  const createdAtMs = parseNonNegativeInteger(record.createdAtMs);
  const lastActivityMs = parseNonNegativeInteger(record.lastActivityMs);
  if (watchers === null || createdAtMs === null || lastActivityMs === null) {
    return null;
  }

  return {
    id: record.id,
    hasController: record.hasController,
    canControl: record.canControl,
    watchers,
    createdAtMs,
    lastActivityMs,
    command:
      typeof record.command === "string" && record.command.length > 0
        ? record.command
        : null,
  };
}

export function parseSessionsResponse(raw: unknown): SessionParseResult {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      failure: {
        source: "parse",
        reason: "invalid_payload",
      },
    };
  }

  const payload = raw as Record<string, unknown>;
  const sessionsPayload = payload[SESSIONS_ENVELOPE_FIELD];
  if (!Array.isArray(sessionsPayload)) {
    return {
      ok: false,
      failure: {
        source: "parse",
        reason: "missing_sessions_array",
      },
    };
  }

  let invalidEntries = 0;
  const totalEntries = sessionsPayload.length;
  const sessions = sessionsPayload
    .map((entry): SessionSnapshot | null => {
      const parsed = parseSessionSnapshot(entry);
      if (!parsed) {
        invalidEntries += 1;
        return null;
      }
      return parsed;
    })
    .filter((entry): entry is SessionSnapshot => entry !== null);

  const parsePolicyResult = evaluateSessionsParsePolicy({
    totalEntries,
    invalidEntries,
    validEntries: sessions.length,
  });
  if (!parsePolicyResult.ok) {
    const policyFailure =
      parsePolicyResult.reason === "all_sessions_invalid"
        ? {
            source: "parse" as const,
            reason: "all_sessions_invalid" as const,
            invalidEntries,
            totalEntries,
          }
        : {
            source: "parse" as const,
            reason: "too_many_invalid_sessions" as const,
            invalidEntries,
            totalEntries,
          };
    return {
      ok: false,
      failure: policyFailure,
    };
  }

  return {
    ok: true,
    sessions,
    invalidEntries,
  };
}
