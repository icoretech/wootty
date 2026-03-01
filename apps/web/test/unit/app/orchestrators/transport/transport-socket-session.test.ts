import { describe, expect, it, vi } from "vitest";
import type { TransportSocketEventBridge } from "../../../../../src/features/terminal/app/engine/transport/transport-socket-event-bridge";
import { TransportSocketSession } from "../../../../../src/features/terminal/app/engine/transport/transport-socket-session";
import {
  type TerminalTransport,
  type TerminalTransportEventType,
  TRANSPORT_READY_STATE,
} from "../../../../../src/features/terminal/contracts/transport/transport";

type ListenerMap = Record<TerminalTransportEventType, EventListener | null>;

class SocketDouble implements TerminalTransport {
  readyState = TRANSPORT_READY_STATE.CONNECTING;
  readonly close = vi.fn((code?: number, reason?: string) => {
    void code;
    void reason;
  });
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
    const firstDetach = vi.fn();
    const secondDetach = vi.fn();
    const bind = vi
      .fn()
      .mockReturnValueOnce(firstDetach)
      .mockReturnValueOnce(secondDetach);
    const eventBridge = {
      bind,
    } as unknown as TransportSocketEventBridge;
    const session = new TransportSocketSession(eventBridge);

    const firstSocket = new SocketDouble();
    const firstGeneration = session.attach(firstSocket, createHandlers());

    expect(firstGeneration).toBe(1);
    expect(session.current()).toBe(firstSocket);

    const secondSocket = new SocketDouble();
    const secondGeneration = session.attach(secondSocket, createHandlers());

    expect(secondGeneration).toBe(2);
    expect(session.currentGeneration()).toBe(2);
    expect(session.current()).toBe(secondSocket);
    expect(firstDetach).toHaveBeenCalledTimes(1);

    session.clear();
    expect(secondDetach).toHaveBeenCalledTimes(1);
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
    session.attach(secondSocket, createHandlers());

    expect(session.releaseIfCurrent(firstSocket, firstGeneration)).toBe(false);
    expect(session.current()).toBe(secondSocket);

    const currentGeneration = session.currentGeneration();
    expect(session.releaseIfCurrent(secondSocket, currentGeneration)).toBe(
      true,
    );
    expect(session.current()).toBeNull();

    session.attach(firstSocket, createHandlers());
    expect(session.detachForSocketSwap()).toBe(firstSocket);
    expect(session.current()).toBeNull();
  });
});
