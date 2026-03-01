import { parseNonNegativeInteger } from "../validation/non-negative-integer";
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

export const TERMINAL_PROTOCOL_FAILURE_DETAILS = [
  "non_text_frame",
  "json_parse_error",
  "payload_not_object",
  "invalid_message_type",
  "unsupported_message_type",
  "missing_ready_session_id",
  "invalid_ready_read_only",
  "invalid_output_data",
  "invalid_exit_payload",
  "missing_error_message",
  "wire_version_mismatch",
] as const;

export type TerminalProtocolFailureDetail =
  (typeof TERMINAL_PROTOCOL_FAILURE_DETAILS)[number];

export type TerminalProtocolFailure = {
  reason: TerminalProtocolFailureReason;
  detail?: TerminalProtocolFailureDetail;
  cause?: unknown;
};

type ServerMessageParseResult =
  | { message: ServerMessage }
  | { failure: TerminalProtocolFailure };

function malformedPayload(
  detail: TerminalProtocolFailureDetail,
  cause?: unknown,
): ServerMessageParseResult {
  return {
    failure: {
      reason: "malformed_payload",
      detail,
      cause,
    },
  };
}

function parseReadyMessage(
  message: Record<string, unknown>,
): ServerMessageParseResult {
  if (typeof message.sessionId !== "string" || message.sessionId.length === 0) {
    return malformedPayload("missing_ready_session_id", {
      field: "sessionId",
      value: message.sessionId,
    });
  }
  if (typeof message.readOnly !== "boolean") {
    return malformedPayload("invalid_ready_read_only", {
      field: "readOnly",
      value: message.readOnly,
    });
  }
  if (message.version !== TERMINAL_WIRE_CONTRACT_VERSION) {
    return {
      failure: {
        reason: "incompatible_version",
        detail: "wire_version_mismatch",
      },
    };
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
  const code = parseNonNegativeInteger(message.code);
  const signal = parseNonNegativeInteger(message.signal);
  if (code === null || signal === null) {
    return null;
  }
  return {
    type: TERMINAL_SERVER_MESSAGE_TYPE.EXIT,
    code,
    signal,
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
    return parsed
      ? { message: parsed }
      : malformedPayload("invalid_output_data", {
          field: "data",
          value: message.data,
        });
  }
  if (type === TERMINAL_SERVER_MESSAGE_TYPE.EXIT) {
    const parsed = parseExitMessage(message);
    return parsed
      ? { message: parsed }
      : malformedPayload("invalid_exit_payload", {
          field: "code|signal",
          value: { code: message.code, signal: message.signal },
        });
  }
  if (type === TERMINAL_SERVER_MESSAGE_TYPE.ERROR) {
    const parsed = parseErrorMessage(message);
    return parsed
      ? { message: parsed }
      : malformedPayload("missing_error_message", {
          field: "message",
          value: message.message,
        });
  }
  if (type === TERMINAL_SERVER_MESSAGE_TYPE.PONG) {
    return { message: { type: TERMINAL_SERVER_MESSAGE_TYPE.PONG } };
  }
  if (typeof type === "string") {
    return {
      failure: {
        reason: "unsupported_type",
        detail: "unsupported_message_type",
      },
    };
  }
  return malformedPayload("invalid_message_type", {
    field: "type",
    value: type,
  });
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
    return malformedPayload("non_text_frame");
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return malformedPayload("payload_not_object");
    }
    return parseKnownMessage(parsed as Record<string, unknown>);
  } catch (error) {
    return malformedPayload("json_parse_error", error);
  }
}
