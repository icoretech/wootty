export const NOTICE_PROTOCOL_FAILURE_DETAILS = [
  "non_text_frame",
  "json_parse_error",
  "payload_not_object",
  "invalid_message_type",
  "unsupported_message_type",
  "missing_ready_session_id",
  "invalid_ready_read_only",
  "invalid_output_data",
  "invalid_exit_payload",
  "missing_error_message",
  "wire_version_mismatch",
] as const;

export type NoticeProtocolFailureDetail =
  (typeof NOTICE_PROTOCOL_FAILURE_DETAILS)[number];

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
