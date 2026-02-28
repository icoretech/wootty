import type {
  SessionCandidate,
  SessionSnapshot,
} from "../../contracts/session";

type SessionCandidateInput = {
  readonly liveSessions: SessionSnapshot[];
  readonly currentSessionId: string;
  readonly sessionHistoryIds: string[];
  readonly lastSessionId: string;
};

type SessionCandidateSets = {
  readonly liveSessionCandidates: SessionCandidate[];
  readonly historySessionCandidates: string[];
};

type SessionParseResult = {
  readonly sessions: SessionSnapshot[];
  readonly invalidEntries: number;
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

export function parseSessionsResponse(raw: unknown): SessionParseResult {
  if (!raw || typeof raw !== "object") {
    return { sessions: [], invalidEntries: 0 };
  }

  const payload = raw as { sessions?: unknown };
  if (!Array.isArray(payload.sessions)) {
    return { sessions: [], invalidEntries: 0 };
  }

  let invalidEntries = 0;
  const sessions = payload.sessions
    .map((entry): SessionSnapshot | null => {
      if (!entry || typeof entry !== "object") {
        invalidEntries += 1;
        return null;
      }

      const record = entry as Record<string, unknown>;
      if (typeof record.id !== "string" || record.id.length === 0) {
        invalidEntries += 1;
        return null;
      }

      const watchers = parseNonNegativeInteger(record.watchers);
      const createdAtMs = parseNonNegativeInteger(record.createdAtMs);
      const lastActivityMs = parseNonNegativeInteger(record.lastActivityMs);
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
        hasController: Boolean(record.hasController),
        watchers,
        createdAtMs,
        lastActivityMs,
        command: typeof record.command === "string" ? record.command : "",
      };
    })
    .filter((entry): entry is SessionSnapshot => entry !== null);

  return {
    sessions,
    invalidEntries,
  };
}

export function deriveSessionCandidates(
  input: SessionCandidateInput,
): SessionCandidateSets {
  const fallbackHistory =
    input.sessionHistoryIds.length > 0
      ? input.sessionHistoryIds
      : input.lastSessionId
        ? [input.lastSessionId]
        : [];

  const liveSessionCandidates: SessionCandidate[] = [];
  const historySessionCandidates: string[] = [];
  const seenSessionIds = new Set<string>();

  for (const live of [...input.liveSessions].sort(
    (left, right) => right.lastActivityMs - left.lastActivityMs,
  )) {
    if (live.id === input.currentSessionId || seenSessionIds.has(live.id)) {
      continue;
    }

    seenSessionIds.add(live.id);
    liveSessionCandidates.push({
      id: live.id,
      mode: live.hasController ? "watch" : "control",
      command: live.command,
      watchers: live.watchers,
      lastActivityMs: live.lastActivityMs,
    });
  }

  for (const historical of fallbackHistory) {
    if (
      !historical ||
      historical === input.currentSessionId ||
      seenSessionIds.has(historical)
    ) {
      continue;
    }

    seenSessionIds.add(historical);
    historySessionCandidates.push(historical);
  }

  return {
    liveSessionCandidates,
    historySessionCandidates,
  };
}
