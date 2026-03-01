import { assertNever } from "../../lib/assert-never";
import { normalizeCauseToMessage } from "../../shared/sanitization/normalize-cause-message";
import type { ProtocolNotice } from "../contracts/protocol-notice";

export function toProtocolNotice(details: ProtocolNotice): string {
  switch (details.reason) {
    case "unsupported_type": {
      const rawTypeSuffix = details.rawType ? ` (type=${details.rawType})` : "";
      return `Received an unsupported server message type${rawTypeSuffix}.`;
    }
    case "malformed_payload": {
      const cause = normalizeCauseToMessage(details.cause);
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
