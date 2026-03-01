import type { TerminalProtocolFailure } from "../../protocol/terminal-protocol";
import type {
  NoticeProtocolFailureDetail,
  ProtocolNotice,
} from "../contracts/protocol-notice";

function toNoticeProtocolFailureDetail(
  detail: TerminalProtocolFailure["detail"],
): NoticeProtocolFailureDetail | undefined {
  return detail;
}

export function toProtocolFailureNotice(
  failure: TerminalProtocolFailure,
): ProtocolNotice {
  if (failure.reason === "unsupported_type") {
    return {
      context: "protocol",
      reason: "unsupported_type",
      rawType: failure.rawType,
    };
  }

  if (failure.reason === "malformed_payload") {
    return {
      context: "protocol",
      reason: "malformed_payload",
      detail: toNoticeProtocolFailureDetail(failure.detail),
      cause: failure.cause,
    };
  }

  return {
    context: "protocol",
    reason: failure.reason,
  };
}
