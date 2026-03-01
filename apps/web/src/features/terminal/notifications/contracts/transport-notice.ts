import { TRANSPORT_FAILURE_REASON_CODES } from "../../contracts/transport/failure-reason";

const TRANSPORT_NOTICE_REASON_CODES = [
  "attach_handshake_send_failed",
  ...TRANSPORT_FAILURE_REASON_CODES,
] as const;

export type TransportNoticeReasonCode =
  (typeof TRANSPORT_NOTICE_REASON_CODES)[number];

export type TransportNotice = {
  context: "transport";
  reasonCode: TransportNoticeReasonCode;
  source?: "error" | "close";
  code?: number | string;
  debugDetail?: string;
  cause?: unknown;
};
