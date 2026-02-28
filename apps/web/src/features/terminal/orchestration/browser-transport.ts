import {
  type TerminalTransport,
  type TerminalTransportCloseEvent,
  type TerminalTransportErrorEvent,
  type TerminalTransportEventType,
  type TerminalTransportListener,
  type TerminalTransportMessageEvent,
  type TerminalTransportOpenEvent,
  type TerminalTransportReadyState,
  TRANSPORT_READY_STATE,
} from "../contracts/transport";

type BrowserSocket = {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  addEventListener: (
    type: TerminalTransportEventType,
    listener: EventListener,
  ) => void;
  removeEventListener: (
    type: TerminalTransportEventType,
    listener: EventListener,
  ) => void;
};

type BrowserSocketFactory = (url: string) => BrowserSocket;

type ListenerRegistry = {
  [K in TerminalTransportEventType]: Map<
    TerminalTransportListener<K>,
    EventListener
  >;
};

function toTransportReadyState(value: number): TerminalTransportReadyState {
  switch (value) {
    case 0:
      return TRANSPORT_READY_STATE.CONNECTING;
    case 1:
      return TRANSPORT_READY_STATE.OPEN;
    case 2:
      return TRANSPORT_READY_STATE.CLOSING;
    default:
      return TRANSPORT_READY_STATE.CLOSED;
  }
}

function defaultBrowserSocketFactory(url: string): BrowserSocket {
  return new WebSocket(url);
}

function createListenerRegistry(): ListenerRegistry {
  return {
    open: new Map(),
    message: new Map(),
    close: new Map(),
    error: new Map(),
  };
}

function wrapOpenListener(
  listener: TerminalTransportListener<"open">,
): EventListener {
  return () => {
    const event: TerminalTransportOpenEvent = {};
    listener(event);
  };
}

function wrapMessageListener(
  listener: TerminalTransportListener<"message">,
): EventListener {
  return (event) => {
    const normalized: TerminalTransportMessageEvent = {
      data:
        event instanceof MessageEvent && typeof event.data === "string"
          ? event.data
          : "",
    };
    listener(normalized);
  };
}

function wrapCloseListener(
  listener: TerminalTransportListener<"close">,
): EventListener {
  return (event) => {
    const normalized: TerminalTransportCloseEvent =
      event instanceof CloseEvent
        ? { code: event.code, reason: event.reason }
        : { code: 1006, reason: "" };
    listener(normalized);
  };
}

function wrapErrorListener(
  listener: TerminalTransportListener<"error">,
): EventListener {
  return (event) => {
    const message =
      event instanceof ErrorEvent &&
      typeof event.message === "string" &&
      event.message.length > 0
        ? event.message
        : "transport error";
    const normalized: TerminalTransportErrorEvent = {
      source: "transport",
      message,
      cause: event,
    };
    listener(normalized);
  };
}

function addSocketListener<T extends TerminalTransportEventType>(
  socket: BrowserSocket,
  listenerMap: ListenerRegistry,
  type: T,
  listener: TerminalTransportListener<T>,
): void {
  switch (type) {
    case "open": {
      const typedListener = listener as TerminalTransportListener<"open">;
      if (listenerMap.open.has(typedListener)) {
        return;
      }
      const wrapped = wrapOpenListener(typedListener);
      listenerMap.open.set(typedListener, wrapped);
      socket.addEventListener("open", wrapped);
      return;
    }
    case "message": {
      const typedListener = listener as TerminalTransportListener<"message">;
      if (listenerMap.message.has(typedListener)) {
        return;
      }
      const wrapped = wrapMessageListener(typedListener);
      listenerMap.message.set(typedListener, wrapped);
      socket.addEventListener("message", wrapped);
      return;
    }
    case "close": {
      const typedListener = listener as TerminalTransportListener<"close">;
      if (listenerMap.close.has(typedListener)) {
        return;
      }
      const wrapped = wrapCloseListener(typedListener);
      listenerMap.close.set(typedListener, wrapped);
      socket.addEventListener("close", wrapped);
      return;
    }
    case "error": {
      const typedListener = listener as TerminalTransportListener<"error">;
      if (listenerMap.error.has(typedListener)) {
        return;
      }
      const wrapped = wrapErrorListener(typedListener);
      listenerMap.error.set(typedListener, wrapped);
      socket.addEventListener("error", wrapped);
      return;
    }
    default:
      return;
  }
}

function removeSocketListener<T extends TerminalTransportEventType>(
  socket: BrowserSocket,
  listenerMap: ListenerRegistry,
  type: T,
  listener: TerminalTransportListener<T>,
): void {
  switch (type) {
    case "open": {
      const typedListener = listener as TerminalTransportListener<"open">;
      const wrapped = listenerMap.open.get(typedListener);
      if (!wrapped) {
        return;
      }
      socket.removeEventListener("open", wrapped);
      listenerMap.open.delete(typedListener);
      return;
    }
    case "message": {
      const typedListener = listener as TerminalTransportListener<"message">;
      const wrapped = listenerMap.message.get(typedListener);
      if (!wrapped) {
        return;
      }
      socket.removeEventListener("message", wrapped);
      listenerMap.message.delete(typedListener);
      return;
    }
    case "close": {
      const typedListener = listener as TerminalTransportListener<"close">;
      const wrapped = listenerMap.close.get(typedListener);
      if (!wrapped) {
        return;
      }
      socket.removeEventListener("close", wrapped);
      listenerMap.close.delete(typedListener);
      return;
    }
    case "error": {
      const typedListener = listener as TerminalTransportListener<"error">;
      const wrapped = listenerMap.error.get(typedListener);
      if (!wrapped) {
        return;
      }
      socket.removeEventListener("error", wrapped);
      listenerMap.error.delete(typedListener);
      return;
    }
    default:
      return;
  }
}

export function createBrowserTransport(
  url: string,
  socketFactory: BrowserSocketFactory = defaultBrowserSocketFactory,
): TerminalTransport {
  const socket = socketFactory(url);
  const listenerMap = createListenerRegistry();

  return {
    get readyState() {
      return toTransportReadyState(socket.readyState);
    },
    send(data: string) {
      socket.send(data);
    },
    close(code?: number, reason?: string) {
      socket.close(code, reason);
    },
    addEventListener<T extends TerminalTransportEventType>(
      type: T,
      listener: TerminalTransportListener<T>,
    ) {
      addSocketListener(socket, listenerMap, type, listener);
    },
    removeEventListener<T extends TerminalTransportEventType>(
      type: T,
      listener: TerminalTransportListener<T>,
    ) {
      removeSocketListener(socket, listenerMap, type, listener);
    },
  };
}
