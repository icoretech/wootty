import {
  TERMINAL_SERVER_ERROR_CODE,
  type TerminalServerErrorCode,
} from "../contracts/session";

type ServerMessage =
  | { type: "ready"; sessionId: string; readOnly: boolean }
  | { type: "output"; data: string }
  | { type: "exit"; code: number; signal: number }
  | { type: "error"; message: string; code?: TerminalServerErrorCode }
  | { type: "pong" };

type ServerMessageParseResult =
  | { message: ServerMessage }
  | { reason: "malformed_payload" | "unsupported_type" };

function parseServerErrorCode(
  value: unknown,
): TerminalServerErrorCode | undefined {
  switch (value) {
    case TERMINAL_SERVER_ERROR_CODE.SESSION_NOT_FOUND:
    case TERMINAL_SERVER_ERROR_CODE.ATTACH_FORBIDDEN:
      return value;
    default:
      return undefined;
  }
}

export function parseServerMessageWithReason(
  raw: unknown,
): ServerMessageParseResult {
  if (typeof raw !== "string") {
    return { reason: "malformed_payload" };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { reason: "malformed_payload" };
    }

    const message = parsed as Record<string, unknown>;

    switch (message.type) {
      case "ready":
        if (
          typeof message.sessionId === "string" &&
          message.sessionId.length > 0
        ) {
          const readOnly =
            typeof message.readOnly === "boolean" ? message.readOnly : false;
          return {
            message: { type: "ready", sessionId: message.sessionId, readOnly },
          };
        }
        return { reason: "malformed_payload" };
      case "output":
        if (typeof message.data === "string") {
          return { message: { type: "output", data: message.data } };
        }
        return { reason: "malformed_payload" };
      case "exit":
        if (
          typeof message.code === "number" &&
          typeof message.signal === "number"
        ) {
          return {
            message: {
              type: "exit",
              code: message.code,
              signal: message.signal,
            },
          };
        }
        return { reason: "malformed_payload" };
      case "error":
        if (typeof message.message === "string") {
          const code = parseServerErrorCode(message.code);
          return { message: { type: "error", message: message.message, code } };
        }
        return { reason: "malformed_payload" };
      case "pong":
        return { message: { type: "pong" } };
      default:
        return typeof message.type === "string"
          ? { reason: "unsupported_type" }
          : { reason: "malformed_payload" };
    }
  } catch {
    return { reason: "malformed_payload" };
  }
}
