import { describe, expect, it } from "vitest";
import {
  NOTICE_BOOTSTRAP_ISSUE_CODES,
  type NoticeBootstrapIssueCode,
} from "../../../../src/features/terminal/notifications/contracts/bootstrap-notice";
import {
  NOTICE_PROTOCOL_FAILURE_DETAILS,
  type NoticeProtocolFailureDetail,
} from "../../../../src/features/terminal/notifications/contracts/protocol-notice";
import {
  NOTICE_SERVER_ERROR_REASONS,
  type NoticeServerErrorReason,
} from "../../../../src/features/terminal/notifications/contracts/server-notice";
import type {
  SessionNotice,
  SessionsRefreshNotice,
  StorageNotice,
} from "../../../../src/features/terminal/notifications/contracts/session-notice";
import type { TransportNotice } from "../../../../src/features/terminal/notifications/contracts/transport-notice";

describe("notice contract modules", () => {
  it("exports bootstrap, protocol, and server code registries", () => {
    expect(NOTICE_BOOTSTRAP_ISSUE_CODES).toContain("socket_url_invalid_format");
    expect(NOTICE_PROTOCOL_FAILURE_DETAILS).toContain("invalid_message_type");
    expect(NOTICE_SERVER_ERROR_REASONS).toContain("attach_forbidden");
  });

  it("keeps session and transport notice unions assignable", () => {
    const refreshNotice: SessionsRefreshNotice = {
      context: "sessions_refresh",
      reason: "http",
      status: 503,
    };
    const storageNotice: StorageNotice = {
      context: "storage",
      operation: "read",
      key: "wootty.lastSession",
    };
    const sessionNotice: SessionNotice =
      Math.random() > 0.5 ? refreshNotice : storageNotice;
    const transportNotice: TransportNotice = {
      context: "transport",
      reasonCode: "socket_failure",
      source: "error",
    };

    expect(sessionNotice.context === "storage").toBeTypeOf("boolean");
    expect(transportNotice.reasonCode).toBe("socket_failure");
  });
});

type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type AssertTrue<T extends true> = T;

type _BootstrapCodeLiteralCheck = AssertTrue<
  IsEqual<
    NoticeBootstrapIssueCode,
    | "env_socket_url_invalid_format"
    | "env_socket_url_requires_window_host"
    | "env_socket_url_unsupported_protocol"
    | "env_socket_url_required"
    | "socket_url_invalid_format"
    | "socket_url_unsupported_protocol"
  >
>;
type _ProtocolDetailLiteralCheck = AssertTrue<
  IsEqual<
    NoticeProtocolFailureDetail,
    | "non_text_frame"
    | "json_parse_error"
    | "payload_not_object"
    | "invalid_message_type"
    | "unsupported_message_type"
    | "missing_ready_session_id"
    | "invalid_ready_read_only"
    | "invalid_output_data"
    | "invalid_exit_payload"
    | "missing_error_message"
    | "wire_version_mismatch"
  >
>;
type _ServerReasonLiteralCheck = AssertTrue<
  IsEqual<
    NoticeServerErrorReason,
    | "session_not_found"
    | "attach_forbidden"
    | "incompatible_version"
    | "attach_required"
    | "read_only_forbidden"
    | "session_not_writable"
    | "session_not_resizable"
  >
>;
