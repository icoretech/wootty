import {
  TERMINAL_SERVER_ERROR_CODES,
  type TerminalServerErrorCode,
} from "../../protocol/server-error-codes";

export const NOTICE_SERVER_ERROR_REASONS = TERMINAL_SERVER_ERROR_CODES;

export type NoticeServerErrorReason = TerminalServerErrorCode;

export type ServerNotice =
  | { context: "server"; reason: NoticeServerErrorReason }
  | { context: "server"; reason: "missing_code" }
  | { context: "server"; reason: "raw_code"; code: string };
