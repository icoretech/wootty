export type TerminalBackendEndpoints = {
  sessionsHttpUrl: string;
  terminalWsUrl: string;
};

export const BACKEND_RESOLUTION_ISSUE_CODES = [
  "env_socket_url_invalid_format",
  "env_socket_url_requires_window_host",
  "env_socket_url_unsupported_protocol",
  "env_socket_url_required",
  "socket_url_invalid_format",
  "socket_url_unsupported_protocol",
] as const;

export type BackendResolutionIssueCode =
  (typeof BACKEND_RESOLUTION_ISSUE_CODES)[number];

export type TerminalBackendResolutionIssue = {
  code: BackendResolutionIssueCode;
  details: string;
};

export function isBackendResolutionIssueCode(
  value: unknown,
): value is BackendResolutionIssueCode {
  return (
    typeof value === "string" &&
    (BACKEND_RESOLUTION_ISSUE_CODES as readonly string[]).includes(value)
  );
}

export type TerminalBackendResolution =
  | {
      ok: true;
      endpoints: TerminalBackendEndpoints;
    }
  | {
      ok: false;
      issue: TerminalBackendResolutionIssue;
    };
