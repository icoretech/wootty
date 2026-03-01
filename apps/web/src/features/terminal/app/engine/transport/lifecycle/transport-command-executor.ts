import type { TerminalTransport } from "../../../../contracts/transport/transport";
import { TRANSPORT_READY_STATE } from "../../../../contracts/transport/transport";
import { TERMINAL_CLOSE_CODE } from "../state/transport-policy";
import type {
  SocketCloseIntent,
  TransportEvent,
} from "../state/transport-state-machine";

type TransportCommandExecutorDeps = {
  dispatchEvent: (event: TransportEvent) => void;
  setCloseIntent: (intent: SocketCloseIntent) => void;
  clearLifecycleTimers: () => void;
  closeActiveSocket: (code: number, reason: string) => boolean;
  detachSocketForSwap: () => TerminalTransport | null;
  clearSocket: () => void;
  connect: () => void;
};

export class TransportCommandExecutor {
  private readonly deps: TransportCommandExecutorDeps;

  constructor(deps: TransportCommandExecutorDeps) {
    this.deps = deps;
  }

  private executeLifecycleCommand(options: {
    clearReconnectAttempts?: boolean;
    closeIntent?: SocketCloseIntent;
    tryClose: () => boolean;
    fallback: () => void;
  }): void {
    if (options.clearReconnectAttempts) {
      this.deps.dispatchEvent({ type: "clear-reconnect-attempts" });
    }
    if (options.closeIntent) {
      this.deps.setCloseIntent(options.closeIntent);
    }
    this.deps.clearLifecycleTimers();
    if (options.tryClose()) {
      return;
    }
    options.fallback();
  }

  reconnectNow(): void {
    this.executeLifecycleCommand({
      clearReconnectAttempts: true,
      closeIntent: "manual",
      tryClose: () => {
        return this.deps.closeActiveSocket(
          TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
          "manual reconnect",
        );
      },
      fallback: () => {
        this.deps.connect();
      },
    });
  }

  reconnectWithEndpointChange(): void {
    this.executeLifecycleCommand({
      clearReconnectAttempts: true,
      tryClose: () => {
        const previousSocket = this.deps.detachSocketForSwap();
        if (
          previousSocket &&
          previousSocket.readyState < TRANSPORT_READY_STATE.CLOSING
        ) {
          // Detach before reconnect so connect() is not blocked by old socket state.
          this.deps.connect();
          previousSocket.close(
            TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
            "endpoint changed",
          );
          return true;
        }
        return false;
      },
      fallback: () => {
        this.deps.connect();
      },
    });
  }

  scheduleFreshConnection(): void {
    this.executeLifecycleCommand({
      clearReconnectAttempts: true,
      closeIntent: "fresh",
      tryClose: () => {
        return this.deps.closeActiveSocket(
          TERMINAL_CLOSE_CODE.START_FRESH_SESSION,
          "start fresh session",
        );
      },
      fallback: () => {
        this.deps.connect();
      },
    });
  }

  dispose(): void {
    this.executeLifecycleCommand({
      closeIntent: "dispose",
      tryClose: () => {
        return this.deps.closeActiveSocket(1000, "component unmount");
      },
      fallback: () => {
        this.deps.clearSocket();
        this.deps.dispatchEvent({ type: "socket-closed" });
      },
    });
  }
}
