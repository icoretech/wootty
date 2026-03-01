import { assertNever } from "../../lib/assert-never";
import type { TerminalServerErrorCode } from "../../protocol/server-error-codes";
import {
  parseServerMessageWithReason,
  type ServerMessage,
  type TerminalProtocolFailureReason,
} from "../../protocol/terminal-protocol";

type HandleIncomingServerMessageArgs = {
  rawData: string;
  onEmptyPayload: () => void;
  onProtocolFailure: (reason: TerminalProtocolFailureReason) => void;
  onReady: (message: Extract<ServerMessage, { type: "ready" }>) => void;
  onOutput: (message: Extract<ServerMessage, { type: "output" }>) => void;
  onExit: (message: Extract<ServerMessage, { type: "exit" }>) => void;
  onServerError: (message: Extract<ServerMessage, { type: "error" }>) => void;
  onPong: () => void;
};

export function handleIncomingServerMessage({
  rawData,
  onEmptyPayload,
  onProtocolFailure,
  onReady,
  onOutput,
  onExit,
  onServerError,
  onPong,
}: HandleIncomingServerMessageArgs): void {
  if (rawData.length === 0) {
    onEmptyPayload();
    return;
  }

  const parsed = parseServerMessageWithReason(rawData);
  if ("reason" in parsed) {
    onProtocolFailure(parsed.reason);
    return;
  }

  switch (parsed.message.type) {
    case "ready":
      onReady(parsed.message);
      return;
    case "output":
      onOutput(parsed.message);
      return;
    case "exit":
      onExit(parsed.message);
      return;
    case "error":
      onServerError(parsed.message);
      return;
    case "pong":
      onPong();
      return;
    default:
      assertNever(parsed.message);
  }
}

type HandleServerErrorPolicyArgs = {
  code?: TerminalServerErrorCode;
  rawCode?: string;
  onSessionNotFound: () => void;
  onAttachForbidden: () => void;
  onIncompatibleVersion: () => void;
  onAttachRequired: () => void;
  onReadOnlyForbidden: () => void;
  onSessionNotWritable: () => void;
  onSessionNotResizable: () => void;
  onUnknownCode: (code: string) => void;
  onMissingCode: () => void;
};

export function handleServerErrorPolicy({
  code,
  rawCode,
  onSessionNotFound,
  onAttachForbidden,
  onIncompatibleVersion,
  onAttachRequired,
  onReadOnlyForbidden,
  onSessionNotWritable,
  onSessionNotResizable,
  onUnknownCode,
  onMissingCode,
}: HandleServerErrorPolicyArgs): void {
  if (code === "session_not_found") {
    onSessionNotFound();
    return;
  }

  if (code === "attach_forbidden") {
    onAttachForbidden();
    return;
  }

  if (code === "incompatible_version") {
    onIncompatibleVersion();
    return;
  }

  if (code === "attach_required") {
    onAttachRequired();
    return;
  }

  if (code === "read_only_forbidden") {
    onReadOnlyForbidden();
    return;
  }

  if (code === "session_not_writable") {
    onSessionNotWritable();
    return;
  }

  if (code === "session_not_resizable") {
    onSessionNotResizable();
    return;
  }

  if (rawCode) {
    onUnknownCode(rawCode);
    return;
  }

  onMissingCode();
}
