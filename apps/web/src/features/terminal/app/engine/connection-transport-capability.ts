import { type MutableRefObject, useCallback, useMemo } from "react";
import type { AttachMode } from "../../contracts/session/session";
import type {
  TerminalTransport,
  TerminalTransportMessageEvent,
} from "../../contracts/transport/transport";
import type {
  ConnectionNoticePublisher,
  TransportNoticePublisher,
} from "../../notifications/notice-contract";
import type { Scheduler } from "../../platform/scheduler";
import { createAttachMessage } from "../../protocol/terminal-client-messages";
import type { TerminalClientMessage } from "../../protocol/terminal-wire-schema";
import type {
  SessionRefreshRequest,
  SessionRefreshResult,
} from "../../session/application/session-refresh-result";
import { useConnectionMessageGateway } from "./protocol/connection-message-gateway";
import type { ConnectionStatusFlag } from "./protocol/connection-status-projector";
import type { TransportFailureSink } from "./transport/transport-failure-contract";
import {
  type TransportOrchestrator,
  useTransportOrchestrator,
} from "./transport/transport-orchestrator";

type UseConnectionTransportCapabilityArgs = {
  createTransport: (url: string) => TerminalTransport;
  wsUrl: string | null;
  attachMode: AttachMode;
  sessionId: string | null;
  hasSessionContext: () => boolean;
  publishConnectionNotice: ConnectionNoticePublisher;
  publishTransportNotice: TransportNoticePublisher;
  setStatusFlag: (next: ConnectionStatusFlag | null) => void;
  setSessionMode: (mode: AttachMode) => void;
  applyReadySession: (nextSessionId: string, readOnly: boolean) => void;
  clearMissingSession: () => void;
  requestSessionRefresh: (
    request: SessionRefreshRequest,
  ) => Promise<SessionRefreshResult>;
  writeServerError: (message: string) => void;
  flushAfterReady: () => void;
  writeOutputAndTrackBytes: (data: string) => void;
  writeExit: (code: number, signal: number) => void;
  sendNow: (payload: TerminalClientMessage) => boolean;
  runtimeFitSizeRef: MutableRefObject<{ cols: number; rows: number }>;
  markPongRef: MutableRefObject<() => void>;
  scheduler: Scheduler;
};

export function useConnectionTransportCapability({
  createTransport,
  wsUrl,
  attachMode,
  sessionId,
  hasSessionContext,
  publishConnectionNotice,
  publishTransportNotice,
  setStatusFlag,
  setSessionMode,
  applyReadySession,
  clearMissingSession,
  requestSessionRefresh,
  writeServerError,
  flushAfterReady,
  writeOutputAndTrackBytes,
  writeExit,
  sendNow,
  runtimeFitSizeRef,
  markPongRef,
  scheduler,
}: UseConnectionTransportCapabilityArgs): TransportOrchestrator {
  const reportSocketFailure = useCallback<TransportFailureSink>(
    ({ source, code, reasonCode, technicalDetail, cause, noticeMessage }) => {
      publishTransportNotice({
        context: "transport",
        source,
        reasonCode: reasonCode ?? "socket_failure",
        code,
        debugDetail: technicalDetail,
        noticeMessage,
        cause,
      });
    },
    [publishTransportNotice],
  );

  const { handleSocketMessage } = useConnectionMessageGateway({
    publishNotice: publishConnectionNotice,
    setStatusFlag,
    applyReadySession,
    clearMissingSession,
    requestSessionRefresh,
    setSessionMode,
    writeServerError,
    flushAfterReady,
    writeOutputAndTrackBytes,
    writeExit,
    markPong: () => {
      markPongRef.current();
    },
  });

  const handlers = useMemo(
    () => ({
      onOpen: () => {
        setStatusFlag(null);
        const fitSize = runtimeFitSizeRef.current;
        const attachSent = sendNow(
          createAttachMessage({
            sessionId,
            cols: fitSize.cols,
            rows: fitSize.rows,
            watch: attachMode === "watch",
          }),
        );
        if (attachSent) {
          return;
        }
        publishTransportNotice({
          context: "transport",
          reasonCode: "attach_handshake_send_failed",
        });
      },
      onMessage: (event: TerminalTransportMessageEvent) => {
        if (event.malformed) {
          publishConnectionNotice({
            context: "protocol",
            reason: "malformed_transport_event",
            details: event.malformed,
          });
          return;
        }
        handleSocketMessage(event.data);
      },
    }),
    [
      attachMode,
      handleSocketMessage,
      publishConnectionNotice,
      publishTransportNotice,
      runtimeFitSizeRef,
      sendNow,
      sessionId,
      setStatusFlag,
    ],
  );

  return useTransportOrchestrator({
    createTransport,
    wsUrl,
    handlers,
    hasSessionContext,
    onSocketFailure: reportSocketFailure,
    scheduler,
  });
}
