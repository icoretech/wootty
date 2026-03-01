export const NOTICE_SERVER_ERROR_REASONS = [
  "session_not_found",
  "attach_forbidden",
  "incompatible_version",
  "attach_required",
  "read_only_forbidden",
  "session_not_writable",
  "session_not_resizable",
] as const;

export type NoticeServerErrorReason =
  (typeof NOTICE_SERVER_ERROR_REASONS)[number];

export type ServerNotice =
  | { context: "server"; reason: NoticeServerErrorReason }
  | { context: "server"; reason: "missing_code" }
  | { context: "server"; reason: "raw_code"; code: string };
