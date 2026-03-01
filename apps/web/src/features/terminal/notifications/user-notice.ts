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
  const parts: string[] = [];
  if (details.source) {
    parts.push(details.source);
  }
  if (typeof details.code === "number" || typeof details.code === "string") {
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

function toFullscreenNotice(details: FullscreenNotice): string {
  const cause = describeCause(details.cause);
  return cause
    ? `Unable to toggle fullscreen mode (${cause}).`
    : "Unable to toggle fullscreen mode.";
}

function toRuntimeNotice(details: RuntimeNotice): string {
  return details.reason && details.reason.length > 0
    ? `Unable to start terminal runtime (${details.reason}).`
    : "Unable to start terminal runtime.";
}

function toServerNotice(details: ServerNotice): string {
  switch (details.reason) {
    case "session_not_found":
      return "Selected session is no longer running on the server. Start a new session.";
    case "attach_forbidden":
      return "Server denied control attach. Switched to watch mode for safety.";
    case "incompatible_version":
      return "Client/server protocol versions are incompatible. Refresh the page and retry.";
    case "attach_required":
      return "Server requires an active session attach before sending terminal input or resize events.";
    case "read_only_forbidden":
      return "Server denied the action because this session is read-only.";
    case "session_not_writable":
      return "Server reported the active session is not writable.";
    case "session_not_resizable":
      return "Server reported the active session is not resizable.";
    case "missing_code":
      return "Server rejected request without an error code. Check server logs for details.";
    case "raw_code":
      return `Server rejected request with code '${details.code}'. Check server logs for details.`;
    default:
      return assertNever(details);
  }
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

export function toUserNotice(details: NoticeDetails): string {
  switch (details.context) {
    case "sessions_refresh":
      return NOTICE_FORMATTERS.sessions_refresh(details);
    case "fullscreen":
      return NOTICE_FORMATTERS.fullscreen(details);
    case "runtime":
      return NOTICE_FORMATTERS.runtime(details);
    case "protocol":
      return NOTICE_FORMATTERS.protocol(details);
    case "transport":
      return NOTICE_FORMATTERS.transport(details);
    case "server":
      return NOTICE_FORMATTERS.server(details);
    case "bootstrap":
      return NOTICE_FORMATTERS.bootstrap(details);
    case "storage":
      return NOTICE_FORMATTERS.storage(details);
    default:
      return assertNever(details);
  }
}
