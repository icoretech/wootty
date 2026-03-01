import type { TerminalTransport } from "../../../contracts/transport/transport";
import { TRANSPORT_READY_STATE } from "../../../contracts/transport/transport";
import {
  TransportSocketEventBridge,
  type TransportSocketEventHandlers,
} from "./transport-socket-event-bridge";

export class TransportSocketSession {
  private readonly eventBridge: TransportSocketEventBridge;
  private socket: TerminalTransport | null = null;
  private detachListeners: (() => void) | null = null;

  constructor(eventBridge = new TransportSocketEventBridge()) {
    this.eventBridge = eventBridge;
  }

  current(): TerminalTransport | null {
    return this.socket;
  }

  hasActiveConnection(): boolean {
    return (
      this.socket !== null &&
      this.socket.readyState <= TRANSPORT_READY_STATE.OPEN
    );
  }

  attach(
    socket: TerminalTransport,
    handlers: TransportSocketEventHandlers,
  ): void {
    this.clear();
    this.socket = socket;
    this.detachListeners = this.eventBridge.bind(socket, handlers);
  }

  closeActive(code: number, reason: string): boolean {
    if (
      this.socket === null ||
      this.socket.readyState >= TRANSPORT_READY_STATE.CLOSING
    ) {
      return false;
    }
    this.socket.close(code, reason);
    return true;
  }

  detachForSocketSwap(): TerminalTransport | null {
    const previous = this.socket;
    this.clear();
    return previous;
  }

  releaseIfCurrent(socket: TerminalTransport): boolean {
    if (this.socket !== socket) {
      return false;
    }
    this.clear();
    return true;
  }

  clear(): void {
    if (this.detachListeners !== null) {
      this.detachListeners();
      this.detachListeners = null;
    }
    this.socket = null;
  }
}
