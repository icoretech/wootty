import type { ProtocolNotice } from "../../contracts/notice";
import type { TerminalProtocolFailure } from "../../protocol/terminal-protocol";

export function toProtocolFailureNotice(
  failure: TerminalProtocolFailure,
): ProtocolNotice {
  if (failure.reason === "malformed_payload") {
    return {
      context: "protocol",
      reason: "malformed_payload",
      detail: failure.detail,
      cause: failure.cause,
    };
  }

  return {
    context: "protocol",
    reason: failure.reason,
  };
}
