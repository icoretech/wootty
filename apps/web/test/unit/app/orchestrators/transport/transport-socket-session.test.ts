import { describe, expect, it, vi } from "vitest";
import { TransportSocketSession } from "../../../../../src/features/terminal/app/engine/transport/lifecycle/transport-socket-session";
import {
  type TerminalTransport,
  type TerminalTransportEventType,
  TRANSPORT_READY_STATE,
} from "../../../../../src/features/terminal/contracts/transport/transport";

type ListenerMap = Record<TerminalTransportEventType, EventListener | null>;

class SocketDouble implements TerminalTransport {
  readyState = TRANSPORT_READY_STATE.CONNECTING;
  readonly close = vi.fn((_code?: number, _reason?: string) => {});
  private readonly listeners: ListenerMap = {
    open: null,
    message: null,
    close: null,
    error: null,
  };

  send(_data: string): void {}

  addEventListener(type: TerminalTransportEventType, listener: EventListener) {
    this.listeners[type] = listener;
  }

  removeEventListener(
    type: TerminalTransportEventType,
    listener: EventListener,
  ): void {
    if (this.listeners[type] === listener) {
      this.listeners[type] = null;
    }
  }

  emit(type: TerminalTransportEventType, event: Event): void {
    this.listeners[type]?.(event);
  }
}

function createHandlers() {
  return {
    onOpen: vi.fn(),
    onMessage: vi.fn(),
    onClose: vi.fn(),
    onError: vi.fn(),
  };
}

describe("transport socket session", () => {
  it("tracks socket generation and detaches previous listeners on reattach", () => {
    const session = new TransportSocketSession();

    const firstSocket = new SocketDouble();
    const firstHandlers = createHandlers();
    const firstGeneration = session.attach(firstSocket, firstHandlers);

    expect(firstGeneration).toBe(1);
    expect(session.current()).toBe(firstSocket);

    const secondSocket = new SocketDouble();
    const secondHandlers = createHandlers();
    const secondGeneration = session.attach(secondSocket, secondHandlers);

    expect(secondGeneration).toBe(2);
    expect(session.current()).toBe(secondSocket);

    firstSocket.emit("open", new Event("open"));
    secondSocket.emit("open", new Event("open"));
    expect(firstHandlers.onOpen).toHaveBeenCalledTimes(0);
    expect(secondHandlers.onOpen).toHaveBeenCalledTimes(1);

    session.clear();
    secondSocket.emit("open", new Event("open"));
    expect(secondHandlers.onOpen).toHaveBeenCalledTimes(1);
    expect(session.current()).toBeNull();
  });

  it("closes active sockets and skips closing stale ones", () => {
    const session = new TransportSocketSession();
    const socket = new SocketDouble();

    expect(session.closeActive(1000, "no socket")).toBe(false);

    session.attach(socket, createHandlers());
    expect(session.closeActive(1001, "active")).toBe(true);
    expect(socket.close).toHaveBeenCalledWith(1001, "active");

    socket.readyState = TRANSPORT_READY_STATE.CLOSING;
    expect(session.closeActive(1002, "closing")).toBe(false);
  });

  it("releases only the active generation and supports socket swap", () => {
    const session = new TransportSocketSession();
    const firstSocket = new SocketDouble();
    const secondSocket = new SocketDouble();

    const firstGeneration = session.attach(firstSocket, createHandlers());
    const secondGeneration = session.attach(secondSocket, createHandlers());

    expect(
      session.releaseIfCurrentWithIntent(firstSocket, firstGeneration),
    ).toEqual({
      released: false,
      closeIntent: "normal",
    });
    expect(session.current()).toBe(secondSocket);

    expect(
      session.releaseIfCurrentWithIntent(secondSocket, secondGeneration),
    ).toEqual({
      released: true,
      closeIntent: "normal",
    });
    expect(session.current()).toBeNull();

    session.attach(firstSocket, createHandlers());
    expect(session.detachForSocketSwap()).toBe(firstSocket);
    expect(session.current()).toBeNull();
  });
});
