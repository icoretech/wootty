import type { TerminalProtocolFailure } from "../../protocol/terminal-protocol";
import {
  NOTICE_PROTOCOL_FAILURE_DETAILS,
  type NoticeProtocolFailureDetail,
  type ProtocolNotice,
} from "../notice-contract";

function toNoticeProtocolFailureDetail(
  detail: TerminalProtocolFailure["detail"],
): NoticeProtocolFailureDetail | undefined {
  if (!detail) {
    return undefined;
  }
  if ((NOTICE_PROTOCOL_FAILURE_DETAILS as readonly string[]).includes(detail)) {
    return detail;
  }
  return undefined;
}

export function toProtocolFailureNotice(
  failure: TerminalProtocolFailure,
): ProtocolNotice {
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
