import { useCallback } from "react";
import type { AttachMode } from "../../../contracts/session";
import type { NoticePublisher } from "../../../notifications/notice-contract";
import { resolveServerErrorPolicy } from "../../../protocol/policies/server-error-policy";
import type { TerminalServerErrorCode } from "../../../protocol/server-error-codes";
import type {
  SessionRefreshRequest,
  SessionRefreshResult,
} from "../../../session/application/session-refresh-result";
import { handleIncomingServerMessage } from "./connection-message-policy";
import type { ConnectionStatusFlag } from "./connection-status-projector";

type UseConnectionMessageGatewayArgs = {
  publishNotice: NoticePublisher;
  setStatusFlag: (next: ConnectionStatusFlag | null) => void;
  applyReadySession: (nextSessionId: string, readOnly: boolean) => void;
  clearMissingSession: () => void;
  refreshLiveSessions: (
    request: SessionRefreshRequest,
  ) => Promise<SessionRefreshResult>;
  setSessionMode: (mode: AttachMode) => void;
  writeServerError: (message: string) => void;
  flushAfterReady: () => void;
  writeOutputAndTrackBytes: (data: string) => void;
  writeExit: (code: number, signal: number) => void;
  markPong: () => void;
};

type ConnectionMessageGateway = {
  handleSocketMessage: (rawData: string) => void;
};

function toConnectionStatusFlag(
  next:
    | "session_not_found"
    | "attach_forbidden"
    | "protocol_incompatible"
    | undefined,
): ConnectionStatusFlag | null {
  if (!next) {
    return null;
  }
  return next;
}

export function useConnectionMessageGateway({
  publishNotice,
  setStatusFlag,
  applyReadySession,
  clearMissingSession,
  refreshLiveSessions,
  setSessionMode,
  writeServerError,
  flushAfterReady,
  writeOutputAndTrackBytes,
  writeExit,
  markPong,
}: UseConnectionMessageGatewayArgs): ConnectionMessageGateway {
  const handleServerError = useCallback(
    (message: string, code?: TerminalServerErrorCode, rawCode?: string) => {
      writeServerError(message);
      const policy = resolveServerErrorPolicy({
        code,
        rawCode,
      });
      publishNotice({
        context: "server",
        ...policy.notice,
      });

      if (policy.clearMissingSession) {
        clearMissingSession();
      }
      if (policy.nextAttachMode) {
        setSessionMode(policy.nextAttachMode);
      }
      const statusFlag = toConnectionStatusFlag(policy.statusFlag);
      if (statusFlag) {
        setStatusFlag(statusFlag);
      }
      if (policy.refreshSessions) {
        void refreshLiveSessions({
          trigger: "transport_event",
        });
      }
    },
    [
      clearMissingSession,
      publishNotice,
      refreshLiveSessions,
      setSessionMode,
      setStatusFlag,
      writeServerError,
    ],
  );

  const handleSocketMessage = useCallback(
    (rawData: string) => {
      handleIncomingServerMessage({
        rawData,
        onEmptyPayload: () => {
          publishNotice({
            context: "protocol",
            reason: "empty_transport_message",
          });
        },
        onProtocolFailure: (failure) => {
          if (failure.reason === "malformed_payload") {
            publishNotice({
              context: "protocol",
              reason: "malformed_payload",
              detail: failure.detail,
              cause: failure.cause,
            });
          } else {
            publishNotice({ context: "protocol", reason: failure.reason });
          }
          if (failure.reason === "incompatible_version") {
            setStatusFlag("protocol_incompatible");
          }
        },
        onReady: ({ sessionId: readySessionId, readOnly }) => {
          applyReadySession(readySessionId, readOnly);
          setStatusFlag(null);
          flushAfterReady();
          void refreshLiveSessions({
            trigger: "transport_event",
          });
        },
        onOutput: ({ data }) => {
          writeOutputAndTrackBytes(data);
        },
        onExit: ({ code, signal }) => {
          writeExit(code, signal);
          setStatusFlag("remote_exit");
        },
        onServerError: ({ message, code, rawCode }) => {
          handleServerError(message, code, rawCode);
        },
        onPong: () => {
          markPong();
        },
      });
    },
    [
      applyReadySession,
      flushAfterReady,
      handleServerError,
      markPong,
      publishNotice,
      refreshLiveSessions,
      setStatusFlag,
      writeExit,
      writeOutputAndTrackBytes,
    ],
  );

  return {
    handleSocketMessage,
  };
}
