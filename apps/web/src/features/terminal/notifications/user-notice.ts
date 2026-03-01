import { assertNever } from "../lib/assert-never";
import type {
  BootstrapNotice,
  FullscreenNotice,
  NoticeDetails,
  ProtocolNotice,
  RuntimeNotice,
  ServerNotice,
  SessionsRefreshNotice,
  StorageNotice,
  TransportNotice,
} from "./notice-contract";

function describeCause(cause: unknown): string | null {
  if (!cause) {
    return null;
  }
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  return null;
}

function toSessionRefreshNotice(details: SessionsRefreshNotice): string {
  switch (details.reason) {
    case "generic":
      return "Unable to refresh live sessions.";
    case "http":
      return `Unable to refresh live sessions (HTTP ${details.status}).`;
    case "cause": {
      const cause = describeCause(details.cause);
      return cause
        ? `Unable to refresh live sessions (${cause}).`
        : "Unable to refresh live sessions.";
    }
    case "invalid_payload":
      return "Session list response was malformed. Keeping the existing list until the next refresh.";
    case "missing_sessions_array":
      return "Session list response did not include a sessions array.";
    case "all_sessions_invalid":
      return `Session list response contained only malformed entries (${details.count}).`;
    case "too_many_invalid_sessions":
      return `Session list response contained too many malformed entries (${details.count}/${details.total}).`;
    case "invalid_entries":
      return `Skipped ${details.count} malformed session entr${details.count === 1 ? "y" : "ies"}.`;
    case "refresh_paused_after_failures":
      return `Automatic session refresh paused after ${details.count} consecutive failures. Retry by reopening the session menu.`;
    default:
      return assertNever(details);
  }
}

function toProtocolNotice(details: ProtocolNotice): string {
  switch (details.reason) {
    case "unsupported_type":
      return "Received an unsupported server message type.";
    case "malformed_payload": {
      const cause = describeCause(details.cause);
      const detailSuffix = details.detail ? ` [detail=${details.detail}]` : "";
      return cause
        ? `Received a malformed server payload${detailSuffix} (${cause}).`
        : `Received a malformed server payload${detailSuffix}.`;
    }
    case "empty_transport_message":
      return "Received an empty transport payload; expected a JSON server message.";
    case "incompatible_version":
      return "Server and client protocol versions are incompatible. Refresh to load the latest app version.";
    case "malformed_transport_event":
      return `Received malformed transport event (${details.details}).`;
    default:
      return assertNever(details);
  }
}

function toTransportNotice(details: TransportNotice): string {
  const TRANSPORT_NOTICE_MESSAGES: Record<
    TransportNotice["reasonCode"],
    string
  > = {
    attach_handshake_send_failed: "Connection problem during attach handshake.",
    send_failed: "Connection problem while sending terminal data.",
    endpoint_unavailable: "Connection problem: websocket endpoint unavailable.",
    endpoint_invalid_format:
      "Connection problem: websocket endpoint format is invalid.",
    endpoint_unsupported_protocol:
      "Connection problem: websocket endpoint protocol is unsupported.",
    bootstrap_failed: "Connection problem during transport bootstrap.",
    socket_failure: "Connection problem (transport failure).",
  };
  const message = TRANSPORT_NOTICE_MESSAGES[details.reasonCode];
  const parts: string[] = [];
  if (details.source) {
    parts.push(details.source);
  }
  if (typeof details.code === "number" || typeof details.code === "string") {
    parts.push(`code=${details.code}`);
  }
  if (details.debugDetail && details.debugDetail.length > 0) {
    parts.push(`detail=${details.debugDetail}`);
  }
  const cause = describeCause(details.cause);
  if (
    cause &&
    (!details.debugDetail ||
      details.debugDetail.length === 0 ||
      details.debugDetail !== cause)
  ) {
    parts.push(`cause=${cause}`);
  }
  const suffix = parts.join(" ");
  return suffix.length > 0 ? `${message} (${suffix})` : message;
}

function toFullscreenNotice(details: FullscreenNotice): string {
  const cause = describeCause(details.cause);
  return cause
    ? `Unable to toggle fullscreen mode (${cause}).`
    : "Unable to toggle fullscreen mode.";
}

function toRuntimeNotice(details: RuntimeNotice): string {
  if (details.reason && details.reason.length > 0) {
    return `Unable to start terminal runtime (${details.reason}).`;
  }
  const cause = describeCause(details.cause);
  return cause
    ? `Unable to start terminal runtime (${cause}).`
    : "Unable to start terminal runtime.";
}

type KnownServerNoticeReason = Exclude<
  ServerNotice["reason"],
  "missing_code" | "raw_code"
>;

const SERVER_NOTICE_MESSAGES: Record<KnownServerNoticeReason, string> = {
  session_not_found:
    "Selected session is no longer running on the server. Start a new session.",
  attach_forbidden:
    "Server denied control attach. Switched to watch mode for safety.",
  incompatible_version:
    "Client/server protocol versions are incompatible. Refresh the page and retry.",
  attach_required:
    "Server requires an active session attach before sending terminal input or resize events.",
  read_only_forbidden:
    "Server denied the action because this session is read-only.",
  session_not_writable: "Server reported the active session is not writable.",
  session_not_resizable: "Server reported the active session is not resizable.",
};

function toServerNotice(details: ServerNotice): string {
  if (details.reason === "missing_code") {
    return "Server rejected request without an error code. Check server logs for details.";
  }
  if (details.reason === "raw_code") {
    return `Server rejected request with code '${details.code}'. Check server logs for details.`;
  }
  return SERVER_NOTICE_MESSAGES[details.reason];
}

function toBootstrapNotice(details: BootstrapNotice): string {
  const codeSuffix = details.code ? ` [code=${details.code}]` : "";
  return `Terminal bootstrap configuration error${codeSuffix} (${details.details}).`;
}

function toStorageNotice(details: StorageNotice): string {
  const reasonSuffix =
    details.reason && details.reason.length > 0 ? ` (${details.reason})` : "";
  return `Browser storage ${details.operation} failed for '${details.key}'${reasonSuffix}. In-memory state remains active.`;
}

type NoticeFormatterRegistry = {
  [Context in NoticeDetails["context"]]: (
    details: Extract<NoticeDetails, { context: Context }>,
  ) => string;
};

const NOTICE_FORMATTERS: NoticeFormatterRegistry = {
  sessions_refresh: toSessionRefreshNotice,
  fullscreen: toFullscreenNotice,
  runtime: toRuntimeNotice,
  protocol: toProtocolNotice,
  transport: toTransportNotice,
  server: toServerNotice,
  bootstrap: toBootstrapNotice,
  storage: toStorageNotice,
};

export const NOTICE_CONTEXTS = Object.freeze(
  Object.keys(NOTICE_FORMATTERS) as NoticeDetails["context"][],
);

function formatNoticeByContext<Context extends NoticeDetails["context"]>(
  details: Extract<NoticeDetails, { context: Context }>,
): string {
  return NOTICE_FORMATTERS[details.context](details);
}

export function toUserNotice(details: NoticeDetails): string {
  return formatNoticeByContext(details);
}
