export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | "error";

type ServerMessage =
  | { type: "ready"; sessionId: string; readOnly: boolean }
  | { type: "output"; data: string }
  | { type: "exit"; code: number; signal: number }
  | { type: "error"; message: string; code?: string }
  | { type: "pong" };

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
