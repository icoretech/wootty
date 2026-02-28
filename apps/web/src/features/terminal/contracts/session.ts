export type AttachMode = "control" | "watch";

export const TERMINAL_SERVER_ERROR_CODE = {
  SESSION_NOT_FOUND: "session_not_found",
  ATTACH_FORBIDDEN: "attach_forbidden",
} as const;

export type TerminalServerErrorCode =
  (typeof TERMINAL_SERVER_ERROR_CODE)[keyof typeof TERMINAL_SERVER_ERROR_CODE];

export interface SessionSnapshot {
  readonly id: string;
  readonly hasController: boolean;
  readonly watchers: number;
  readonly createdAtMs: number;
  readonly lastActivityMs: number;
  readonly command: string;
}

export interface SessionCandidate {
  readonly id: string;
  readonly mode: AttachMode;
  readonly command: string;
  readonly watchers: number;
  readonly lastActivityMs: number;
}
