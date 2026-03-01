import type { SessionCandidate } from "../contracts/session";

type SessionMenuRow = {
  readonly id: string;
  readonly mode: SessionCandidate["mode"];
  readonly actionLabel: string;
  readonly secondaryText: string;
};

export function presentSessionCandidate(
  candidate: SessionCandidate,
  formatAgeLabel: (timestampMs: number) => string,
): SessionMenuRow {
  const actionLabel = candidate.mode === "watch" ? "Watch" : "Resume";
  const secondaryParts = [
    candidate.command ?? "interactive shell",
    formatAgeLabel(candidate.lastActivityMs),
  ];
  if (candidate.watchers > 0) {
    secondaryParts.push(
      `${candidate.watchers} watcher${candidate.watchers === 1 ? "" : "s"}`,
    );
  }

  return {
    id: candidate.id,
    mode: candidate.mode,
    actionLabel,
    secondaryText: secondaryParts.join(" · "),
  };
}
