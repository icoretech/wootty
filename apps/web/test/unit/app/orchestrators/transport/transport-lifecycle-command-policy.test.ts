import { describe, expect, it, vi } from "vitest";
import { TransportLifecycleCommandPolicy } from "../../../../../src/features/terminal/app/engine/transport/lifecycle/transport-lifecycle-command-policy";
import { TERMINAL_CLOSE_CODE } from "../../../../../src/features/terminal/app/engine/transport/state/transport-policy";
import type { TransportEvent } from "../../../../../src/features/terminal/app/engine/transport/state/transport-state-machine";
import {
  type TerminalTransport,
  type TerminalTransportEventType,
  TRANSPORT_READY_STATE,
} from "../../../../../src/features/terminal/contracts/transport/transport";

class SocketDouble implements TerminalTransport {
  readyState = TRANSPORT_READY_STATE.OPEN;
  readonly close = vi.fn((_code?: number, _reason?: string) => {});
  send(_data: string): void {}
  addEventListener(
    _type: TerminalTransportEventType,
    _listener: EventListener,
  ): void {}
  removeEventListener(
    _type: TerminalTransportEventType,
    _listener: EventListener,
  ): void {}
}

function createPolicyHarness() {
  const events: TransportEvent[] = [];
  const clearLifecycleTimers = vi.fn();
  const closeActiveWithIntent = vi.fn();
  const detachForSocketSwap = vi.fn();
  const clearSocketSession = vi.fn();
  const connect = vi.fn();

  const policy = new TransportLifecycleCommandPolicy({
    dispatchEvent: (event) => {
      events.push(event);
    },
    clearLifecycleTimers,
    closeActiveWithIntent,
    detachForSocketSwap,
    clearSocketSession,
    connect,
  });

  return {
    policy,
    events,
    clearLifecycleTimers,
    closeActiveWithIntent,
    detachForSocketSwap,
    clearSocketSession,
    connect,
  };
}

describe("transport lifecycle command policy", () => {
  it("clears reconnect attempts and requests a manual close for reconnectNow", () => {
    const harness = createPolicyHarness();
    harness.closeActiveWithIntent.mockReturnValue(true);

    harness.policy.reconnectNow();

    expect(harness.clearLifecycleTimers).toHaveBeenCalledTimes(1);
    expect(harness.events).toEqual([{ type: "clear-reconnect-attempts" }]);
    expect(harness.closeActiveWithIntent).toHaveBeenCalledWith(
      TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
      "manual reconnect",
      "manual",
    );
    expect(harness.connect).not.toHaveBeenCalled();
  });

  it("detaches and reconnects before closing when endpoint changes", () => {
    const harness = createPolicyHarness();
    const previousSocket = new SocketDouble();
    harness.detachForSocketSwap.mockReturnValue(previousSocket);

    harness.policy.reconnectWithEndpointChange();

    expect(harness.clearLifecycleTimers).toHaveBeenCalledTimes(1);
    expect(harness.events).toEqual([{ type: "clear-reconnect-attempts" }]);
    expect(harness.connect).toHaveBeenCalledTimes(1);
    expect(previousSocket.close).toHaveBeenCalledWith(
      TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
      "endpoint changed",
    );
  });

  it("falls back to immediate connect when there is no active socket to close", () => {
    const harness = createPolicyHarness();
    harness.closeActiveWithIntent.mockReturnValue(false);

    harness.policy.scheduleFreshConnection();

    expect(harness.closeActiveWithIntent).toHaveBeenCalledWith(
      TERMINAL_CLOSE_CODE.START_FRESH_SESSION,
      "start fresh session",
      "fresh",
    );
    expect(harness.connect).toHaveBeenCalledTimes(1);
  });

  it("clears socket session and emits socket-closed when dispose has no active socket", () => {
    const harness = createPolicyHarness();
    harness.closeActiveWithIntent.mockReturnValue(false);

    harness.policy.dispose();

    expect(harness.clearLifecycleTimers).toHaveBeenCalledTimes(1);
    expect(harness.closeActiveWithIntent).toHaveBeenCalledWith(
      1000,
      "component unmount",
      "dispose",
    );
    expect(harness.clearSocketSession).toHaveBeenCalledTimes(1);
    expect(harness.events).toEqual([{ type: "socket-closed" }]);
  });
});
