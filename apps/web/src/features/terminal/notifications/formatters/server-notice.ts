import type { ServerNotice } from "../notice-contract";

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

export function toServerNotice(details: ServerNotice): string {
  if (details.reason === "missing_code") {
    return "Server rejected request without an error code. Check server logs for details.";
  }
  if (details.reason === "raw_code") {
    return `Server rejected request with code '${details.code}'. Check server logs for details.`;
  }
  return SERVER_NOTICE_MESSAGES[details.reason];
}
