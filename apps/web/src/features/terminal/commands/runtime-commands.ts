export const TERMINAL_RUNTIME_COMMAND = {
  RECONNECT: "reconnect",
  CLEAR: "clear",
} as const;

export type TerminalRuntimeCommand =
  (typeof TERMINAL_RUNTIME_COMMAND)[keyof typeof TERMINAL_RUNTIME_COMMAND];
