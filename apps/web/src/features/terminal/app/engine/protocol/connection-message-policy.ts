import { assertNever } from "../../../lib/assert-never";
import {
  parseServerMessageWithReason,
  type ServerMessage,
  type TerminalProtocolFailure,
} from "../../../protocol/terminal-protocol";

type HandleIncomingServerMessageArgs = {
  rawData: string;
  onEmptyPayload: () => void;
  onProtocolFailure: (failure: TerminalProtocolFailure) => void;
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
  if ("failure" in parsed) {
    onProtocolFailure(parsed.failure);
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
