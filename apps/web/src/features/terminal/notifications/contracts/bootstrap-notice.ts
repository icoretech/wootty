export const NOTICE_BOOTSTRAP_ISSUE_CODES = [
  "env_socket_url_invalid_format",
  "env_socket_url_requires_window_host",
  "env_socket_url_unsupported_protocol",
  "socket_url_invalid_format",
  "socket_url_unsupported_protocol",
] as const;

export type NoticeBootstrapIssueCode =
  (typeof NOTICE_BOOTSTRAP_ISSUE_CODES)[number];

export type BootstrapNotice = {
  context: "bootstrap";
  reason: "backend_resolution_failed";
  details: string;
  code?: NoticeBootstrapIssueCode;
};
