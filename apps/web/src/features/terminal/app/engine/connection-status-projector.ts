import type { ConnectionStatus } from "../../contracts/connection";

export type ConnectionStatusFlag =
  | "runtime_error"
  | "protocol_incompatible"
  | "session_not_found"
  | "attach_forbidden"
  | "remote_exit";

export function projectConnectionStatus(
  statusFlag: ConnectionStatusFlag | null,
  transportStatus: ConnectionStatus,
): ConnectionStatus {
  if (!statusFlag) {
    return transportStatus;
  }

  if (
    statusFlag === "runtime_error" ||
    statusFlag === "protocol_incompatible"
  ) {
    return "error";
  }

  if (statusFlag === "attach_forbidden") {
    return transportStatus === "connected" ? "connected" : transportStatus;
  }

  if (statusFlag === "session_not_found" || statusFlag === "remote_exit") {
    return transportStatus === "connected" ? "closed" : transportStatus;
  }

  return transportStatus;
}

export function shouldClearStatusOverride(
  statusFlag: ConnectionStatusFlag | null,
  transportStatus: ConnectionStatus,
): boolean {
  return statusFlag !== null && transportStatus === "connected";
}
