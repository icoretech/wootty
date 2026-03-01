import {
  TERMINAL_PROTOCOL_FAILURE_DETAILS,
  type TerminalProtocolFailureDetail,
} from "../../protocol/terminal-protocol";

export const NOTICE_PROTOCOL_FAILURE_DETAILS =
  TERMINAL_PROTOCOL_FAILURE_DETAILS;

export type NoticeProtocolFailureDetail = TerminalProtocolFailureDetail;

export type ProtocolNotice =
  | { context: "protocol"; reason: "unsupported_type" }
  | {
      context: "protocol";
      reason: "malformed_payload";
      detail?: NoticeProtocolFailureDetail;
      cause?: unknown;
    }
  | { context: "protocol"; reason: "empty_transport_message" }
  | { context: "protocol"; reason: "incompatible_version" }
  | {
      context: "protocol";
      reason: "malformed_transport_event";
      details: string;
    };
