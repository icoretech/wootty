import type { TerminalTransport } from "../../../../contracts/transport/transport";
import { TRANSPORT_READY_STATE } from "../../../../contracts/transport/transport";
import type { SocketCloseIntent } from "../state/transport-state-machine";
import type { TransportSocketEventHandlers } from "./transport-socket-event-bridge";

type ReleasedSocket = {
  released: boolean;
  closeIntent: SocketCloseIntent;
};

export class TransportSocketSession {
  private socket: TerminalTransport | null = null;
  private detachListeners: (() => void) | null = null;
  private generation = 0;
  private closeIntent: SocketCloseIntent = "normal";

  current(): TerminalTransport | null {
    return this.socket;
  }

  hasActiveConnection(): boolean {
    return (
      this.socket !== null &&
      this.socket.readyState <= TRANSPORT_READY_STATE.OPEN
    );
  }

  isCurrent(socket: TerminalTransport, generation: number): boolean {
    return this.socket === socket && this.generation === generation;
  }

  attach(
    socket: TerminalTransport,
    handlers: TransportSocketEventHandlers,
  ): number {
    this.clear();
    this.generation += 1;
    this.socket = socket;
    this.detachListeners = this.bindSocketHandlers(socket, handlers);
    return this.generation;
  }

  /**
   * Close the active socket if it's in a closable state.
   * Returns false if the socket is already closed/closing, indicating
   * the caller should proceed with cleanup/reconnect without waiting.
   */
  closeActive(
    code: number,
    reason: string,
    closeIntent: SocketCloseIntent = "normal",
  ): boolean {
    if (
      this.socket === null ||
      this.socket.readyState >= TRANSPORT_READY_STATE.CLOSING
    ) {
      // Socket is already closing or closed - clear state and let
      // the close event handler complete the reconnect flow.
      this.clear();
      return false;
    }
    this.closeIntent = closeIntent;
    this.socket.close(code, reason);
    return true;
  }

  detachForSocketSwap(): TerminalTransport | null {
    const previous = this.socket;
    this.clear();
    return previous;
  }

  releaseIfCurrentWithIntent(
    socket: TerminalTransport,
    generation: number,
  ): ReleasedSocket {
    if (!this.isCurrent(socket, generation)) {
      return {
        released: false,
        closeIntent: "normal",
      };
    }
    const closeIntent = this.closeIntent;
    this.clear();
    return {
      released: true,
      closeIntent,
    };
  }

  clear(): void {
    if (this.detachListeners !== null) {
      this.detachListeners();
      this.detachListeners = null;
    }
    this.socket = null;
    this.closeIntent = "normal";
  }

  private bindSocketHandlers(
    socket: TerminalTransport,
    handlers: TransportSocketEventHandlers,
  ): () => void {
    socket.addEventListener("open", handlers.onOpen);
    socket.addEventListener("message", handlers.onMessage);
    socket.addEventListener("close", handlers.onClose);
    socket.addEventListener("error", handlers.onError);
    return () => {
      socket.removeEventListener("open", handlers.onOpen);
      socket.removeEventListener("message", handlers.onMessage);
      socket.removeEventListener("close", handlers.onClose);
      socket.removeEventListener("error", handlers.onError);
    };
  }
}
