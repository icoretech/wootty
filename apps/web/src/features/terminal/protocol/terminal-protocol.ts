import {
  TERMINAL_SERVER_ERROR_CODES,
  type TerminalServerErrorCode,
} from "./server-error-codes";
import {
  TERMINAL_SERVER_MESSAGE_TYPE,
  TERMINAL_WIRE_CONTRACT_VERSION,
} from "./terminal-wire-schema";

export type ServerMessage =
  | {
      type: typeof TERMINAL_SERVER_MESSAGE_TYPE.READY;
      sessionId: string;
      readOnly: boolean;
      version: typeof TERMINAL_WIRE_CONTRACT_VERSION;
    }
  | { type: typeof TERMINAL_SERVER_MESSAGE_TYPE.OUTPUT; data: string }
  | {
      type: typeof TERMINAL_SERVER_MESSAGE_TYPE.EXIT;
      code: number;
      signal: number;
    }
  | {
      type: typeof TERMINAL_SERVER_MESSAGE_TYPE.ERROR;
      message: string;
      code?: TerminalServerErrorCode;
      rawCode?: string;
    }
  | { type: typeof TERMINAL_SERVER_MESSAGE_TYPE.PONG };

export type TerminalProtocolFailureReason =
  | "malformed_payload"
  | "unsupported_type"
  | "incompatible_version";

type ServerMessageParseResult =
  | { message: ServerMessage }
  | { reason: TerminalProtocolFailureReason };

const MALFORMED_PAYLOAD: ServerMessageParseResult = {
  reason: "malformed_payload",
};

function parseReadyMessage(
  message: Record<string, unknown>,
): ServerMessageParseResult {
  if (typeof message.sessionId !== "string" || message.sessionId.length === 0) {
    return MALFORMED_PAYLOAD;
  }
  if (typeof message.readOnly !== "boolean") {
    return MALFORMED_PAYLOAD;
  }
  if (message.version !== TERMINAL_WIRE_CONTRACT_VERSION) {
    return { reason: "incompatible_version" };
  }
  return {
    message: {
      type: TERMINAL_SERVER_MESSAGE_TYPE.READY,
      sessionId: message.sessionId,
      readOnly: message.readOnly,
      version: TERMINAL_WIRE_CONTRACT_VERSION,
    },
  };
}

function parseOutputMessage(
  message: Record<string, unknown>,
): ServerMessage | null {
  if (typeof message.data !== "string") {
    return null;
  }
  return { type: TERMINAL_SERVER_MESSAGE_TYPE.OUTPUT, data: message.data };
}

function parseExitMessage(
  message: Record<string, unknown>,
): ServerMessage | null {
  if (
    typeof message.code !== "number" ||
    !Number.isFinite(message.code) ||
    typeof message.signal !== "number" ||
    !Number.isFinite(message.signal)
  ) {
    return null;
  }
  return {
    type: TERMINAL_SERVER_MESSAGE_TYPE.EXIT,
    code: message.code,
    signal: message.signal,
  };
}

function parseErrorMessage(
  message: Record<string, unknown>,
): ServerMessage | null {
  if (typeof message.message !== "string") {
    return null;
  }
  const parsedCode = parseServerErrorCode(message.code);
  return {
    type: TERMINAL_SERVER_MESSAGE_TYPE.ERROR,
    message: message.message,
    code: parsedCode.code,
    rawCode: parsedCode.rawCode,
  };
}

function parseKnownMessage(
  message: Record<string, unknown>,
): ServerMessageParseResult {
  const type = message.type;
  if (type === TERMINAL_SERVER_MESSAGE_TYPE.READY) {
    return parseReadyMessage(message);
  }
  if (type === TERMINAL_SERVER_MESSAGE_TYPE.OUTPUT) {
    const parsed = parseOutputMessage(message);
    return parsed ? { message: parsed } : MALFORMED_PAYLOAD;
  }
  if (type === TERMINAL_SERVER_MESSAGE_TYPE.EXIT) {
    const parsed = parseExitMessage(message);
    return parsed ? { message: parsed } : MALFORMED_PAYLOAD;
  }
  if (type === TERMINAL_SERVER_MESSAGE_TYPE.ERROR) {
    const parsed = parseErrorMessage(message);
    return parsed ? { message: parsed } : MALFORMED_PAYLOAD;
  }
  if (type === TERMINAL_SERVER_MESSAGE_TYPE.PONG) {
    return { message: { type: TERMINAL_SERVER_MESSAGE_TYPE.PONG } };
  }
  if (typeof type === "string") {
    return { reason: "unsupported_type" };
  }
  return MALFORMED_PAYLOAD;
}

function parseServerErrorCode(value: unknown): {
  code?: TerminalServerErrorCode;
  rawCode?: string;
} {
  if (typeof value !== "string") {
    return {};
  }
  if (TERMINAL_SERVER_ERROR_CODES.includes(value as TerminalServerErrorCode)) {
    return { code: value as TerminalServerErrorCode };
  }
  return value.length > 0 ? { rawCode: value } : {};
}

export function parseServerMessageWithReason(
  raw: unknown,
): ServerMessageParseResult {
  if (typeof raw !== "string") {
    return MALFORMED_PAYLOAD;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return MALFORMED_PAYLOAD;
    }
    return parseKnownMessage(parsed as Record<string, unknown>);
  } catch {
    return MALFORMED_PAYLOAD;
  }
}
