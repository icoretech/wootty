import {
  type TerminalTransport,
  TRANSPORT_READY_STATE,
} from "../../../../contracts/transport/transport";
import { TERMINAL_CLOSE_CODE } from "../state/transport-policy";
import type {
  SocketCloseIntent,
  TransportEvent,
} from "../state/transport-state-machine";

type TransportLifecycleCommandPolicyDeps = {
  dispatchEvent: (event: TransportEvent) => void;
  clearLifecycleTimers: () => void;
  closeActiveWithIntent: (
    code: number,
    reason: string,
    closeIntent: SocketCloseIntent,
  ) => boolean;
  detachForSocketSwap: () => TerminalTransport | null;
  clearSocketSession: () => void;
  connect: () => void;
};

export class TransportLifecycleCommandPolicy {
  private readonly deps: TransportLifecycleCommandPolicyDeps;

  constructor(deps: TransportLifecycleCommandPolicyDeps) {
    this.deps = deps;
  }

  reconnectNow(): void {
    this.executeLifecycleCommand({
      clearReconnectAttempts: true,
      tryClose: () => {
        return this.deps.closeActiveWithIntent(
          TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
          "manual reconnect",
          "manual",
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
        const previousSocket = this.deps.detachForSocketSwap();
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
      tryClose: () => {
        return this.deps.closeActiveWithIntent(
          TERMINAL_CLOSE_CODE.START_FRESH_SESSION,
          "start fresh session",
          "fresh",
        );
      },
      fallback: () => {
        this.deps.connect();
      },
    });
  }

  dispose(): void {
    this.executeLifecycleCommand({
      tryClose: () => {
        return this.deps.closeActiveWithIntent(
          1000,
          "component unmount",
          "dispose",
        );
      },
      fallback: () => {
        this.deps.clearSocketSession();
        this.deps.dispatchEvent({ type: "socket-closed" });
      },
    });
  }

  private executeLifecycleCommand(options: {
    clearReconnectAttempts?: boolean;
    tryClose: () => boolean;
    fallback: () => void;
  }): void {
    if (options.clearReconnectAttempts) {
      this.deps.dispatchEvent({ type: "clear-reconnect-attempts" });
    }
    this.deps.clearLifecycleTimers();
    if (options.tryClose()) {
      return;
    }
    options.fallback();
  }
}
