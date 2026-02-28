type NoticeContext =
  | "sessions_refresh"
  | "fullscreen"
  | "transport"
  | "protocol";

type NoticeDetails = {
  context: NoticeContext;
  status?: number;
  source?: "error" | "close";
  code?: number;
  reason?: string;
  parseReason?: "unsupported_type" | "malformed_payload";
  cause?: unknown;
};

function describeCause(cause: unknown): string | null {
  if (!cause) {
    return null;
  }
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  return null;
}

export function toUserNotice(details: NoticeDetails): string {
  switch (details.context) {
    case "sessions_refresh": {
      const cause = describeCause(details.cause);
      if (typeof details.status === "number") {
        return `Unable to refresh live sessions (HTTP ${details.status}).`;
      }
      if (cause) {
        return `Unable to refresh live sessions (${cause}).`;
      }
      return "Unable to refresh live sessions.";
    }
    case "fullscreen": {
      const cause = describeCause(details.cause);
      if (cause) {
        return `Unable to toggle fullscreen mode (${cause}).`;
      }
      return "Unable to toggle fullscreen mode.";
    }
    case "protocol":
      return details.parseReason === "unsupported_type"
        ? "Received an unsupported server message type."
        : "Received a malformed server payload.";
    case "transport": {
      const parts: string[] = [];
      if (details.source) {
        parts.push(details.source);
      }
      if (typeof details.code === "number") {
        parts.push(`code=${details.code}`);
      }
      if (details.reason && details.reason.length > 0) {
        parts.push(`reason=${details.reason}`);
      }
      const suffix = parts.join(" ");
      return suffix.length > 0
        ? `Connection problem (${suffix}).`
        : "Connection problem (transport error).";
    }
    default:
      return "Unexpected client error.";
  }
}
