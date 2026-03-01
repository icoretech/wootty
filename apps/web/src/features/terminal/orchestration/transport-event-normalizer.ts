import type {
  TerminalTransportCloseEvent,
  TerminalTransportErrorEvent,
  TerminalTransportFailureCode,
  TerminalTransportMessageEvent,
  TerminalTransportOpenEvent,
} from "../contracts/transport";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function summarizeShape(value: unknown): string {
  if (!isRecord(value)) {
    return typeof value;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return "empty object";
  }
  return keys.sort((left, right) => left.localeCompare(right)).join(",");
}

function readErrorCode(
  value: unknown,
): TerminalTransportFailureCode | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const code = value.code;
  if (typeof code === "string" && code.length > 0) {
    return code;
  }
  if (typeof code === "number" && Number.isFinite(code)) {
    return code;
  }
  return undefined;
}

export function normalizeTransportOpenEvent(): TerminalTransportOpenEvent {
  return {};
}

export function normalizeTransportMessageEvent(
  event: unknown,
): TerminalTransportMessageEvent {
  if (event instanceof MessageEvent && typeof event.data === "string") {
    return { data: event.data };
  }

  if (isRecord(event)) {
    const data = readStringField(event, "data");
    if (data.length > 0) {
      return { data };
    }
    return {
      data: "",
      malformed: summarizeShape(event),
    };
  }

  return {
    data: "",
    malformed: summarizeShape(event),
  };
}

export function normalizeTransportCloseEvent(
  event: unknown,
): TerminalTransportCloseEvent {
  if (event instanceof CloseEvent) {
    return { code: event.code, reason: event.reason };
  }

  if (isRecord(event)) {
    const code = event.code;
    const reason = event.reason;
    return {
      code: typeof code === "number" && Number.isFinite(code) ? code : 1006,
      reason: typeof reason === "string" ? reason : "",
    };
  }

  return { code: 1006, reason: "" };
}

export function normalizeTransportErrorEvent(
  event: unknown,
  fallbackMessage = "transport error",
): TerminalTransportErrorEvent {
  let message = fallbackMessage;
  let cause: unknown = event;

  if (event instanceof ErrorEvent && event.message.length > 0) {
    message = event.message;
  } else if (event instanceof Error && event.message.length > 0) {
    message = event.message;
  } else if (isRecord(event)) {
    const candidate = readStringField(event, "message");
    if (candidate.length > 0) {
      message = candidate;
    } else {
      message = `${fallbackMessage} (${summarizeShape(event)})`;
    }
    if ("cause" in event) {
      cause = event.cause;
    }
  } else {
    message = `${fallbackMessage} (${summarizeShape(event)})`;
  }

  const code = readErrorCode(event);
  return {
    source: "transport",
    message,
    ...(typeof code === "string" ? { code } : {}),
    ...(typeof code === "number" ? { code } : {}),
    ...(cause === undefined ? {} : { cause }),
  };
}
