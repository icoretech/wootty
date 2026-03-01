import type { BootstrapNotice } from "./contracts/bootstrap-notice";
import type { ProtocolNotice } from "./contracts/protocol-notice";
import type {
  FullscreenNotice,
  RuntimeNotice,
} from "./contracts/runtime-notice";
import type { ServerNotice } from "./contracts/server-notice";
import type { SessionNotice } from "./contracts/session-notice";
import type { TransportNotice } from "./contracts/transport-notice";

export * from "./contracts/bootstrap-notice";
export * from "./contracts/protocol-notice";
export * from "./contracts/runtime-notice";
export * from "./contracts/server-notice";
export * from "./contracts/session-notice";
export * from "./contracts/transport-notice";

export type NoticeDetails =
  | SessionNotice
  | FullscreenNotice
  | RuntimeNotice
  | ProtocolNotice
  | TransportNotice
  | ServerNotice
  | BootstrapNotice;

export type SessionNoticePublisher = (details: SessionNotice) => void;

export type ConnectionNoticePublisher = (
  details: ProtocolNotice | ServerNotice,
) => void;

export type RuntimeNoticePublisher = (
  details: RuntimeNotice | FullscreenNotice,
) => void;

export type TransportNoticePublisher = (details: TransportNotice) => void;
