import { useCallback } from "react";
import type { AttachMode } from "../../contracts/session";
import type { NoticePublisher } from "../../notifications/notice-contract";
import type { TerminalServerErrorCode } from "../../protocol/server-error-codes";
import type { SessionRefreshResult } from "../../session/application/session-refresh-result";
import {
  handleIncomingServerMessage,
  handleServerErrorPolicy,
} from "./connection-message-policy";
import type { ConnectionStatusFlag } from "./connection-status-projector";

type UseConnectionMessageGatewayArgs = {
  publishNotice: NoticePublisher;
  setStatusFlag: (next: ConnectionStatusFlag | null) => void;
  applyReadySession: (nextSessionId: string, readOnly: boolean) => void;
  clearMissingSession: () => void;
  refreshLiveSessions: (requestId?: number) => Promise<SessionRefreshResult>;
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
      handleServerErrorPolicy({
        code,
        rawCode,
        onSessionNotFound: () => {
          publishNotice({
            context: "server",
            reason: "session_not_found",
          });
          clearMissingSession();
          setStatusFlag("session_not_found");
          void refreshLiveSessions();
        },
        onAttachForbidden: () => {
          publishNotice({
            context: "server",
            reason: "attach_forbidden",
          });
          setSessionMode("watch");
          setStatusFlag("attach_forbidden");
        },
        onIncompatibleVersion: () => {
          publishNotice({
            context: "server",
            reason: "incompatible_version",
          });
          setStatusFlag("protocol_incompatible");
        },
        onAttachRequired: () => {
          publishNotice({
            context: "server",
            reason: "attach_required",
          });
        },
        onReadOnlyForbidden: () => {
          publishNotice({
            context: "server",
            reason: "read_only_forbidden",
          });
        },
        onSessionNotWritable: () => {
          publishNotice({
            context: "server",
            reason: "session_not_writable",
          });
        },
        onSessionNotResizable: () => {
          publishNotice({
            context: "server",
            reason: "session_not_resizable",
          });
        },
        onUnknownCode: (unknownCode: string) => {
          publishNotice({
            context: "server",
            reason: "raw_code",
            code: unknownCode,
          });
        },
        onMissingCode: () => {
          publishNotice({
            context: "server",
            reason: "missing_code",
          });
        },
      });
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
        onProtocolFailure: (reason) => {
          publishNotice({ context: "protocol", reason });
          if (reason === "incompatible_version") {
            setStatusFlag("protocol_incompatible");
          }
        },
        onReady: ({ sessionId: readySessionId, readOnly }) => {
          applyReadySession(readySessionId, readOnly);
          setStatusFlag(null);
          flushAfterReady();
          void refreshLiveSessions();
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
