export type TerminalBackendEndpoints = {
  sessionsHttpUrl: string;
  terminalWsUrl: string;
};

const BACKEND_RESOLUTION_ISSUE_CODES = [
  "env_socket_url_invalid_format",
  "env_socket_url_requires_window_host",
  "env_socket_url_unsupported_protocol",
  "socket_url_invalid_format",
  "socket_url_unsupported_protocol",
] as const;

export type BackendResolutionIssueCode =
  (typeof BACKEND_RESOLUTION_ISSUE_CODES)[number];

export type TerminalBackendResolutionIssue = {
  code: BackendResolutionIssueCode;
  details: string;
};

export type TerminalBackendResolution =
  | {
      ok: true;
      endpoints: TerminalBackendEndpoints;
    }
  | {
      ok: false;
      issue: TerminalBackendResolutionIssue;
    };
