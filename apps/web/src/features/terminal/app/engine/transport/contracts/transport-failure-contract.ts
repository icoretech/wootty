import type { TransportFailureReasonCode } from "../../../../contracts/transport/failure-reason";
import type { TerminalTransportFailureCode } from "../../../../contracts/transport/transport";

export type SocketFailureSource = "error" | "close";

export type TransportFailure = {
  source: SocketFailureSource;
  code?: TerminalTransportFailureCode;
  reasonCode?: TransportFailureReasonCode;
  technicalDetail?: string;
  cause?: unknown;
  noticeMessage?: string;
};

export type TransportFailureSink = (failure: TransportFailure) => void;
