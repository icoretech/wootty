import {
  TERMINAL_CLIENT_MESSAGE_TYPE,
  TERMINAL_DIMENSION_LIMIT,
  TERMINAL_WIRE_CONTRACT_VERSION,
  type TerminalClientMessage,
} from "./terminal-wire-schema";

function normalizeTerminalDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return TERMINAL_DIMENSION_LIMIT.MIN;
  }
  return Math.min(
    TERMINAL_DIMENSION_LIMIT.MAX,
    Math.max(TERMINAL_DIMENSION_LIMIT.MIN, Math.floor(value)),
  );
}

function normalizeTerminalSize(
  cols: number,
  rows: number,
): {
  cols: number;
  rows: number;
} {
  return {
    cols: normalizeTerminalDimension(cols),
    rows: normalizeTerminalDimension(rows),
  };
}

export function createAttachMessage(args: {
  cols: number;
  rows: number;
  sessionId: string | null;
  watch?: boolean;
}): TerminalClientMessage {
  const normalizedSize = normalizeTerminalSize(args.cols, args.rows);
  const message: TerminalClientMessage = {
    type: TERMINAL_CLIENT_MESSAGE_TYPE.ATTACH,
    version: TERMINAL_WIRE_CONTRACT_VERSION,
    cols: normalizedSize.cols,
    rows: normalizedSize.rows,
  };
  if (args.sessionId !== null) {
    message.sessionId = args.sessionId;
  }
  if (typeof args.watch === "boolean") {
    message.watch = args.watch;
  }
  return message;
}

export function createInputMessage(data: string): TerminalClientMessage {
  return {
    type: TERMINAL_CLIENT_MESSAGE_TYPE.INPUT,
    data,
  };
}

export function createResizeMessage(
  cols: number,
  rows: number,
): TerminalClientMessage {
  const normalizedSize = normalizeTerminalSize(cols, rows);
  return {
    type: TERMINAL_CLIENT_MESSAGE_TYPE.RESIZE,
    cols: normalizedSize.cols,
    rows: normalizedSize.rows,
  };
}

export function createPingMessage(): TerminalClientMessage {
  return {
    type: TERMINAL_CLIENT_MESSAGE_TYPE.PING,
  };
}
