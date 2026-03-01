import type { TerminalServerErrorCode } from "../protocol/server-error-codes";
import type { TerminalProtocolFailureDetail } from "../protocol/terminal-protocol";
import type { BackendResolutionIssueCode } from "./backend-resolution";
import { TRANSPORT_FAILURE_REASON_CODES } from "./transport-failure-reason";

export type NoticeProtocolFailureDetail = TerminalProtocolFailureDetail;
export type NoticeServerErrorReason = TerminalServerErrorCode;

export type NoticeBootstrapIssueCode = BackendResolutionIssueCode;

const TRANSPORT_NOTICE_REASON_CODES = [
  "attach_handshake_send_failed",
  ...TRANSPORT_FAILURE_REASON_CODES,
] as const;

export type TransportNoticeReasonCode =
  (typeof TRANSPORT_NOTICE_REASON_CODES)[number];

export type SessionsRefreshNotice =
  | { context: "sessions_refresh"; reason: "generic" }
  | { context: "sessions_refresh"; reason: "http"; status: number }
  | { context: "sessions_refresh"; reason: "cause"; cause: unknown }
  | { context: "sessions_refresh"; reason: "invalid_payload" }
  | { context: "sessions_refresh"; reason: "missing_sessions_array" }
  | {
      context: "sessions_refresh";
      reason: "all_sessions_invalid";
      count: number;
    }
  | {
      context: "sessions_refresh";
      reason: "too_many_invalid_sessions";
      count: number;
      total: number;
    }
  | { context: "sessions_refresh"; reason: "invalid_entries"; count: number }
  | {
      context: "sessions_refresh";
      reason: "refresh_paused_after_failures";
      count: number;
    };

export type FullscreenNotice = {
  context: "fullscreen";
  cause?: unknown;
};

export type RuntimeNotice = {
  context: "runtime";
  reason?: string;
  cause?: unknown;
};

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

export type TransportNotice = {
  context: "transport";
  reasonCode: TransportNoticeReasonCode;
  source?: "error" | "close";
  code?: number | string;
  debugDetail?: string;
  cause?: unknown;
};

export type ServerNotice =
  | { context: "server"; reason: NoticeServerErrorReason }
  | { context: "server"; reason: "missing_code" }
  | { context: "server"; reason: "raw_code"; code: string };

export type BootstrapNotice = {
  context: "bootstrap";
  reason: "backend_resolution_failed";
  details: string;
  code?: NoticeBootstrapIssueCode;
};

export type StorageNotice = {
  context: "storage";
  operation: "read" | "write" | "remove" | "parse";
  key: string;
  reason?: string;
};

export type NoticeDetails =
  | SessionsRefreshNotice
  | FullscreenNotice
  | RuntimeNotice
  | ProtocolNotice
  | TransportNotice
  | ServerNotice
  | BootstrapNotice
  | StorageNotice;

export type NoticePublisher = (details: NoticeDetails) => void;
