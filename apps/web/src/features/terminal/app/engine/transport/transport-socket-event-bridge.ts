import type {
  TerminalTransport,
  TerminalTransportCloseEvent,
  TerminalTransportErrorEvent,
  TerminalTransportMessageEvent,
} from "../../../contracts/transport/transport";

type TransportSocketEventHandlers = {
  onOpen: () => void;
  onMessage: (event: TerminalTransportMessageEvent) => void;
  onClose: (event: TerminalTransportCloseEvent) => void;
  onError: (event: TerminalTransportErrorEvent) => void;
};

export class TransportSocketEventBridge {
  bind(
    socket: TerminalTransport,
    handlers: TransportSocketEventHandlers,
  ): void {
    socket.addEventListener("open", handlers.onOpen);
    socket.addEventListener("message", handlers.onMessage);
    socket.addEventListener("close", handlers.onClose);
    socket.addEventListener("error", handlers.onError);
  }
}
