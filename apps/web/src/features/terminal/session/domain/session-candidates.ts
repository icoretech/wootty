import type {
  SessionCandidate,
  SessionSnapshot,
} from "../../contracts/session/session";

type SessionCandidateInput = {
  readonly liveSessions: SessionSnapshot[];
  readonly currentSessionId: string | null;
  readonly sessionHistoryIds: string[];
  readonly lastSessionId: string | null;
};

type SessionCandidateSets = {
  readonly liveSessionCandidates: SessionCandidate[];
  readonly historySessionCandidates: string[];
};

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
      mode: live.canControl ? "control" : "watch",
      command: live.command,
      name: live.name,
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
