import type { ConnectionStatus } from "../contracts/connection";
import type { AttachMode } from "../contracts/session/session";
import { shortSessionId, statusLabel } from "./formatters";

export function buildDocumentTitle({
  attachMode,
  sessionId,
  status,
}: {
  attachMode: AttachMode;
  sessionId: string | null;
  status: ConnectionStatus;
}): string {
  const modeLabel = attachMode === "watch" ? "WATCH" : "LIVE";
  const statusText = statusLabel(status).toUpperCase();
  const idText = sessionId ? shortSessionId(sessionId) : "pending";
  return `${modeLabel} ${idText} ${statusText} · WooTTY`;
}
