import type { SessionSnapshot } from "../../contracts/session";
import {
  SESSION_SNAPSHOT_REQUIRED_FIELDS,
  SESSIONS_ENVELOPE_FIELD,
} from "../../protocol/generated-wire-contract";

type SessionParseResult =
  | {
      readonly ok: true;
      readonly sessions: SessionSnapshot[];
      readonly invalidEntries: number;
    }
  | {
      readonly ok: false;
      readonly reason: "invalid_payload" | "missing_sessions_array";
    };

function parseNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.floor(value);
  if (normalized < 0) {
    return null;
  }

  return normalized;
}

function hasRequiredSessionFields(record: Record<string, unknown>): boolean {
  return SESSION_SNAPSHOT_REQUIRED_FIELDS.every((field) => field in record);
}

export function parseSessionsResponse(raw: unknown): SessionParseResult {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      reason: "invalid_payload",
    };
  }

  const payload = raw as Record<string, unknown>;
  const sessionsPayload = payload[SESSIONS_ENVELOPE_FIELD];
  if (!Array.isArray(sessionsPayload)) {
    return {
      ok: false,
      reason: "missing_sessions_array",
    };
  }

  let invalidEntries = 0;
  const sessions = sessionsPayload
    .map((entry): SessionSnapshot | null => {
      if (!entry || typeof entry !== "object") {
        invalidEntries += 1;
        return null;
      }

      const record = entry as Record<string, unknown>;
      if (!hasRequiredSessionFields(record)) {
        invalidEntries += 1;
        return null;
      }
      if (typeof record.id !== "string" || record.id.length === 0) {
        invalidEntries += 1;
        return null;
      }

      const watchers = parseNonNegativeInteger(record.watchers);
      const createdAtMs = parseNonNegativeInteger(record.createdAtMs);
      const lastActivityMs = parseNonNegativeInteger(record.lastActivityMs);
      if (typeof record.hasController !== "boolean") {
        invalidEntries += 1;
        return null;
      }
      if (typeof record.canControl !== "boolean") {
        invalidEntries += 1;
        return null;
      }
      if (
        watchers === null ||
        createdAtMs === null ||
        lastActivityMs === null
      ) {
        invalidEntries += 1;
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
    })
    .filter((entry): entry is SessionSnapshot => entry !== null);

  return {
    ok: true,
    sessions,
    invalidEntries,
  };
}
