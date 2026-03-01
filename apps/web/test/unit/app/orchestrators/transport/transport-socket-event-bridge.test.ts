import { describe, expect, it, vi } from "vitest";
import { TransportSocketEventBridge } from "../../../../../src/features/terminal/app/engine/transport/lifecycle/transport-socket-event-bridge";
import {
  type TerminalTransport,
  type TerminalTransportEventType,
  TRANSPORT_READY_STATE,
} from "../../../../../src/features/terminal/contracts/transport/transport";

type ListenerMap = Record<TerminalTransportEventType, EventListener | null>;

class SocketDouble implements TerminalTransport {
  readyState = TRANSPORT_READY_STATE.CONNECTING;
  private readonly listeners: ListenerMap;

  constructor(listeners: ListenerMap) {
    this.listeners = listeners;
  }

  send(_data: string): void {}

  close(): void {}

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

describe("transport socket event bridge", () => {
  it("binds and unbinds open/message/close/error listeners", () => {
    const listeners: ListenerMap = {
      open: null,
      message: null,
      close: null,
      error: null,
    };
    const socket = new SocketDouble(listeners);
    const onOpen = vi.fn();
    const onMessage = vi.fn();
    const onClose = vi.fn();
    const onError = vi.fn();
    const bridge = new TransportSocketEventBridge();

    const unbind = bridge.bind(socket, {
      onOpen,
      onMessage,
      onClose,
      onError,
    });

    listeners.open?.(new Event("open"));
    listeners.message?.(new MessageEvent("message", { data: "hello" }));
    listeners.close?.(new CloseEvent("close", { code: 1000, reason: "done" }));
    listeners.error?.(new ErrorEvent("error", { message: "boom" }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    unbind();

    listeners.open?.(new Event("open"));
    listeners.message?.(new MessageEvent("message", { data: "hello" }));
    listeners.close?.(new CloseEvent("close", { code: 1000, reason: "done" }));
    listeners.error?.(new ErrorEvent("error", { message: "boom" }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
