export const ACTIVE_SESSION_STORAGE_KEY = "wootty.activeSessionId";
export const LAST_SESSION_STORAGE_KEY = "wootty.lastSessionId";
export const SESSION_HISTORY_STORAGE_KEY = "wootty.sessionHistory";
export const OUTBOX_MAX_BYTES = 512 * 1024;

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | "error";

export type ServerMessage =
  | { type: "ready"; sessionId: string; readOnly: boolean }
  | { type: "output"; data: string }
  | { type: "exit"; code: number; signal: number }
  | { type: "error"; message: string; code?: string }
  | { type: "pong" };

export interface OutboxState {
  readonly chunks: string[];
  bytes: number;
  droppedBytes: number;
}

const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).length;
}

export function createOutbox(): OutboxState {
  return {
    chunks: [],
    bytes: 0,
    droppedBytes: 0,
  };
}

export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
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
          return { type: "ready", sessionId: message.sessionId, readOnly };
        }
        return null;
      case "output":
        if (typeof message.data === "string") {
          return { type: "output", data: message.data };
        }
        return null;
      case "exit":
        if (
          typeof message.code === "number" &&
          typeof message.signal === "number"
        ) {
          return { type: "exit", code: message.code, signal: message.signal };
        }
        return null;
      case "error":
        if (typeof message.message === "string") {
          const code =
            typeof message.code === "string" && message.code.length > 0
              ? message.code
              : undefined;
          return { type: "error", message: message.message, code };
        }
        return null;
      case "pong":
        return { type: "pong" };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function reconnectDelayMs(attempt: number): number {
  return Math.min(5_000, Math.floor(300 * 1.8 ** attempt));
}

export function enqueueOutbox(
  outbox: OutboxState,
  chunk: string,
  maxBytes = OUTBOX_MAX_BYTES,
): void {
  const bytes = byteLength(chunk);
  outbox.chunks.push(chunk);
  outbox.bytes += bytes;

  while (outbox.bytes > maxBytes && outbox.chunks.length > 0) {
    const removed = outbox.chunks.shift();
    if (!removed) {
      break;
    }
    const removedBytes = byteLength(removed);
    outbox.bytes -= removedBytes;
    outbox.droppedBytes += removedBytes;
  }
}

export function flushOutbox(
  outbox: OutboxState,
  send: (chunk: string) => void,
): number {
  let sentBytes = 0;

  while (outbox.chunks.length > 0) {
    const chunk = outbox.chunks.shift();
    if (!chunk) {
      continue;
    }

    send(chunk);
    const bytes = byteLength(chunk);
    sentBytes += bytes;
    outbox.bytes -= bytes;
  }

  outbox.bytes = Math.max(0, outbox.bytes);

  return sentBytes;
}

export function readStoredSessionId(
  storage: Storage,
  key: string,
): string | undefined {
  const sessionId = storage.getItem(key);
  if (!sessionId || sessionId.length === 0) {
    return undefined;
  }
  return sessionId;
}

export function storeSessionId(
  storage: Storage,
  key: string,
  sessionId: string,
): void {
  storage.setItem(key, sessionId);
}

export function clearStoredSessionId(storage: Storage, key: string): void {
  storage.removeItem(key);
}

export function readSessionHistory(storage: Storage): string[] {
  const raw = storage.getItem(SESSION_HISTORY_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((value): value is string => typeof value === "string")
      .filter((value) => value.length > 0);
  } catch {
    return [];
  }
}

export function writeSessionHistory(
  storage: Storage,
  sessions: string[],
): void {
  storage.setItem(SESSION_HISTORY_STORAGE_KEY, JSON.stringify(sessions));
}

export function pushSessionHistory(
  sessions: string[],
  sessionId: string,
  maxEntries = 8,
): string[] {
  const unique = [
    sessionId,
    ...sessions.filter((value) => value !== sessionId),
  ];
  return unique.slice(0, maxEntries);
}

export function formatLatency(latencyMs: number | null): string {
  if (latencyMs === null) {
    return "-";
  }

  if (latencyMs < 1_000) {
    return `${latencyMs}ms`;
  }

  return `${(latencyMs / 1_000).toFixed(1)}s`;
}

const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB"];

export function formatBytes(bytes: number): string {
  const normalized = Math.max(0, Math.floor(bytes));
  if (normalized < 1024) {
    return `${normalized} B`;
  }

  let value = normalized;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value < 10 ? 1 : 0;
  return `${value.toFixed(precision)} ${BYTE_UNITS[unitIndex]}`;
}
