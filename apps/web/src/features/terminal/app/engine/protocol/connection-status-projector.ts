import type { ConnectionStatus } from "../../../contracts/connection";

export type ConnectionStatusFlag =
  | "runtime_error"
  | "protocol_incompatible"
  | "session_not_found"
  | "remote_exit";

type ConnectionStatusState = {
  transportStatus: ConnectionStatus;
  statusFlag: ConnectionStatusFlag | null;
  status: ConnectionStatus;
};

type ConnectionStatusEvent =
  | { type: "transport-status"; status: ConnectionStatus }
  | { type: "status-flag"; flag: ConnectionStatusFlag | null };

export const initialConnectionStatusState: ConnectionStatusState = {
  transportStatus: "connecting",
  statusFlag: null,
  status: "connecting",
};

function projectStatus(
  transportStatus: ConnectionStatus,
  statusFlag: ConnectionStatusFlag | null,
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

  if (statusFlag === "session_not_found" || statusFlag === "remote_exit") {
    return transportStatus === "connected" ? "closed" : transportStatus;
  }

  return transportStatus;
}

export function reduceConnectionStatusState(
  state: ConnectionStatusState,
  event: ConnectionStatusEvent,
): ConnectionStatusState {
  if (event.type === "transport-status") {
    const nextTransportStatus = event.status;
    const nextFlag =
      nextTransportStatus === "connected" ? null : state.statusFlag;
    const nextStatus = projectStatus(nextTransportStatus, nextFlag);

    if (
      nextTransportStatus === state.transportStatus &&
      nextFlag === state.statusFlag &&
      nextStatus === state.status
    ) {
      return state;
    }

    return {
      transportStatus: nextTransportStatus,
      statusFlag: nextFlag,
      status: nextStatus,
    };
  }

  const nextFlag = event.flag;
  const nextStatus = projectStatus(state.transportStatus, nextFlag);
  if (nextFlag === state.statusFlag && nextStatus === state.status) {
    return state;
  }
  return {
    ...state,
    statusFlag: nextFlag,
    status: nextStatus,
  };
}
