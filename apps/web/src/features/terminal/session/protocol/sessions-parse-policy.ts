import type { SessionRefreshParseFailureReason } from "./session-refresh-failure-contract";

type SessionsParsePolicyInput = {
  totalEntries: number;
  invalidEntries: number;
  validEntries: number;
};

type SessionsParsePolicyResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly reason: SessionRefreshParseFailureReason;
    };

const INVALID_RATIO_THRESHOLD = 0.5;
const MINIMUM_RATIO_SAMPLE_SIZE = 4;

export function evaluateSessionsParsePolicy({
  totalEntries,
  invalidEntries,
  validEntries,
}: SessionsParsePolicyInput): SessionsParsePolicyResult {
  if (invalidEntries > 0 && validEntries === 0) {
    return {
      ok: false,
      reason: "all_sessions_invalid",
    };
  }

  if (
    totalEntries >= MINIMUM_RATIO_SAMPLE_SIZE &&
    invalidEntries / totalEntries >= INVALID_RATIO_THRESHOLD
  ) {
    return {
      ok: false,
      reason: "too_many_invalid_sessions",
    };
  }

  return {
    ok: true,
  };
}
