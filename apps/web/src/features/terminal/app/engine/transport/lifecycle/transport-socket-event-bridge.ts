import type {
  TerminalTransportCloseEvent,
  TerminalTransportErrorEvent,
  TerminalTransportMessageEvent,
} from "../../../../contracts/transport/transport";

export type TransportSocketEventHandlers = {
  onOpen: () => void;
  onMessage: (event: TerminalTransportMessageEvent) => void;
  onClose: (event: TerminalTransportCloseEvent) => void;
  onError: (event: TerminalTransportErrorEvent) => void;
};
