import { assertNever } from "../../lib/assert-never";
import type { SessionsRefreshNotice } from "../contracts/session-notice";
import { normalizeCauseToMessage } from "./cause-message";

export function toSessionRefreshNotice(details: SessionsRefreshNotice): string {
  switch (details.reason) {
    case "generic":
      return "Unable to refresh live sessions.";
    case "request_timeout":
      return `Unable to refresh live sessions (request timed out after ${Math.round(details.timeoutMs / 1000)}s).`;
    case "http":
      return `Unable to refresh live sessions (HTTP ${details.status}).`;
    case "cause": {
      const cause = normalizeCauseToMessage(details.cause);
      return cause
        ? `Unable to refresh live sessions (${cause}).`
        : "Unable to refresh live sessions.";
    }
    case "invalid_payload":
      return "Session list response was malformed. Keeping the existing list until the next refresh.";
    case "missing_sessions_array":
      return "Session list response did not include a sessions array.";
    case "all_sessions_invalid":
      return `Session list response contained only malformed entries (${details.count}).`;
    case "too_many_invalid_sessions":
      return `Session list response contained too many malformed entries (${details.count}/${details.total}).`;
    case "invalid_entries":
      return `Skipped ${details.count} malformed session entr${details.count === 1 ? "y" : "ies"}.`;
    case "refresh_paused_after_failures":
      return `Automatic session refresh paused after ${details.count} consecutive failures. Retry by reopening the session menu.`;
    default:
      return assertNever(details);
  }
}
