import type { TransportNotice } from "../contracts/transport-notice";
import { normalizeCauseToMessage } from "./cause-message";

const TRANSPORT_NOTICE_MESSAGES: Record<TransportNotice["reasonCode"], string> =
  {
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

const MAX_DETAIL_LENGTH = 180;

function sanitizeTransportDetail(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const redacted = trimmed.replace(/([?&]token=)[^&\s]+/gi, "$1[redacted]");
  if (redacted.length <= MAX_DETAIL_LENGTH) {
    return redacted;
  }
  return `${redacted.slice(0, MAX_DETAIL_LENGTH - 3)}...`;
}

export function toTransportNotice(details: TransportNotice): string {
  const message = TRANSPORT_NOTICE_MESSAGES[details.reasonCode];
  const parts: string[] = [];
  const detailMessage = sanitizeTransportDetail(
    details.noticeMessage ?? details.debugDetail,
  );
  if (details.source) {
    parts.push(details.source);
  }
  if (typeof details.code === "number" || typeof details.code === "string") {
    parts.push(`code=${details.code}`);
  }
  if (detailMessage && detailMessage.length > 0) {
    parts.push(`detail=${detailMessage}`);
  }
  const cause = normalizeCauseToMessage(details.cause);
  if (
    cause &&
    (!detailMessage || detailMessage.length === 0 || detailMessage !== cause)
  ) {
    parts.push(`cause=${cause}`);
  }
  const suffix = parts.join(" ");
  return suffix.length > 0 ? `${message} (${suffix})` : message;
}
