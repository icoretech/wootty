import {
  type TerminalTransport,
  type TerminalTransportEventType,
  type TerminalTransportListener,
  type TerminalTransportReadyState,
  TRANSPORT_READY_STATE,
} from "../contracts/transport/transport";
import {
  normalizeTransportCloseEvent,
  normalizeTransportErrorEvent,
  normalizeTransportMessageEvent,
  normalizeTransportOpenEvent,
} from "./transport-event-normalizer";

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

type ListenerEntry<T extends TerminalTransportEventType> = {
  listeners: Map<TerminalTransportListener<T>, EventListener>;
  wrap: (listener: TerminalTransportListener<T>) => EventListener;
};

type ListenerRegistry = {
  [K in TerminalTransportEventType]: ListenerEntry<K>;
};

function wrapOpenListener(
  listener: TerminalTransportListener<"open">,
): EventListener {
  return () => {
    listener(normalizeTransportOpenEvent());
  };
}

function wrapMessageListener(
  listener: TerminalTransportListener<"message">,
): EventListener {
  return (event) => {
    listener(normalizeTransportMessageEvent(event));
  };
}

function wrapCloseListener(
  listener: TerminalTransportListener<"close">,
): EventListener {
  return (event) => {
    listener(normalizeTransportCloseEvent(event));
  };
}

function wrapErrorListener(
  listener: TerminalTransportListener<"error">,
): EventListener {
  return (event) => {
    listener(normalizeTransportErrorEvent(event));
  };
}

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
    open: {
      listeners: new Map(),
      wrap: wrapOpenListener,
    },
    message: {
      listeners: new Map(),
      wrap: wrapMessageListener,
    },
    close: {
      listeners: new Map(),
      wrap: wrapCloseListener,
    },
    error: {
      listeners: new Map(),
      wrap: wrapErrorListener,
    },
  };
}

function getListenerEntry<T extends TerminalTransportEventType>(
  listenerRegistry: ListenerRegistry,
  type: T,
): ListenerEntry<T> {
  return listenerRegistry[type];
}

function addSocketListener<T extends TerminalTransportEventType>(
  socket: BrowserSocket,
  listenerRegistry: ListenerRegistry,
  type: T,
  listener: TerminalTransportListener<T>,
): void {
  const entry = getListenerEntry(listenerRegistry, type);
  if (entry.listeners.has(listener)) {
    return;
  }

  const wrapped = entry.wrap(listener);
  entry.listeners.set(listener, wrapped);
  socket.addEventListener(type, wrapped);
}

function removeSocketListener<T extends TerminalTransportEventType>(
  socket: BrowserSocket,
  listenerRegistry: ListenerRegistry,
  type: T,
  listener: TerminalTransportListener<T>,
): void {
  const entry = getListenerEntry(listenerRegistry, type);
  const wrapped = entry.listeners.get(listener);
  if (!wrapped) {
    return;
  }

  socket.removeEventListener(type, wrapped);
  entry.listeners.delete(listener);
}

export function createBrowserTransport(
  url: string,
  socketFactory: BrowserSocketFactory = defaultBrowserSocketFactory,
): TerminalTransport {
  const socket = socketFactory(url);
  const listenerRegistry = createListenerRegistry();

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
      addSocketListener(socket, listenerRegistry, type, listener);
    },
    removeEventListener<T extends TerminalTransportEventType>(
      type: T,
      listener: TerminalTransportListener<T>,
    ) {
      removeSocketListener(socket, listenerRegistry, type, listener);
    },
  };
}
