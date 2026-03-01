import { describe, expect, it, vi } from "vitest";
import { TransportCommandExecutor } from "../../../../../src/features/terminal/app/engine/transport/transport-command-executor";
import { TERMINAL_CLOSE_CODE } from "../../../../../src/features/terminal/app/engine/transport/transport-policy";
import type {
  SocketCloseIntent,
  TransportEvent,
} from "../../../../../src/features/terminal/app/engine/transport/transport-state-machine";
import {
  type TerminalTransport,
  TRANSPORT_READY_STATE,
} from "../../../../../src/features/terminal/contracts/transport/transport";

type CommandHarness = {
  dispatchEvent: (event: TransportEvent) => void;
  setCloseIntent: (intent: SocketCloseIntent) => void;
  clearLifecycleTimers: () => void;
  closeActiveSocket: (code: number, reason: string) => boolean;
  detachSocketForSwap: () => TerminalTransport | null;
  clearSocket: () => void;
  connect: () => void;
};

describe("transport command executor", () => {
  it("closes active socket for manual reconnect and skips immediate connect", () => {
    const harness: CommandHarness = {
      dispatchEvent: vi.fn(),
      setCloseIntent: vi.fn(),
      clearLifecycleTimers: vi.fn(),
      closeActiveSocket: vi.fn(() => true),
      detachSocketForSwap: vi.fn(() => null),
      clearSocket: vi.fn(),
      connect: vi.fn(),
    };
    const executor = new TransportCommandExecutor(harness);

    executor.reconnectNow();

    expect(harness.dispatchEvent).toHaveBeenCalledWith({
      type: "clear-reconnect-attempts",
    });
    expect(harness.setCloseIntent).toHaveBeenCalledWith("manual");
    expect(harness.clearLifecycleTimers).toHaveBeenCalledTimes(1);
    expect(harness.closeActiveSocket).toHaveBeenCalledWith(
      TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
      "manual reconnect",
    );
    expect(harness.connect).not.toHaveBeenCalled();
  });

  it("connects immediately for manual reconnect when no active socket exists", () => {
    const harness: CommandHarness = {
      dispatchEvent: vi.fn(),
      setCloseIntent: vi.fn(),
      clearLifecycleTimers: vi.fn(),
      closeActiveSocket: vi.fn(() => false),
      detachSocketForSwap: vi.fn(() => null),
      clearSocket: vi.fn(),
      connect: vi.fn(),
    };
    const executor = new TransportCommandExecutor(harness);

    executor.reconnectNow();

    expect(harness.connect).toHaveBeenCalledTimes(1);
  });

  it("detaches and closes previous socket during endpoint change reconnect", () => {
    const previousSocket = {
      readyState: TRANSPORT_READY_STATE.OPEN,
      close: vi.fn(),
      send: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as TerminalTransport;

    const harness: CommandHarness = {
      dispatchEvent: vi.fn(),
      setCloseIntent: vi.fn(),
      clearLifecycleTimers: vi.fn(),
      closeActiveSocket: vi.fn(() => false),
      detachSocketForSwap: vi.fn(() => previousSocket),
      clearSocket: vi.fn(),
      connect: vi.fn(),
    };
    const executor = new TransportCommandExecutor(harness);

    executor.reconnectWithEndpointChange();

    expect(harness.dispatchEvent).toHaveBeenCalledWith({
      type: "clear-reconnect-attempts",
    });
    expect(harness.clearLifecycleTimers).toHaveBeenCalledTimes(1);
    expect(harness.connect).toHaveBeenCalledTimes(1);
    expect(previousSocket.close).toHaveBeenCalledWith(
      TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
      "endpoint changed",
    );
  });

  it("closes active socket for fresh session and sets fresh intent", () => {
    const harness: CommandHarness = {
      dispatchEvent: vi.fn(),
      setCloseIntent: vi.fn(),
      clearLifecycleTimers: vi.fn(),
      closeActiveSocket: vi.fn(() => true),
      detachSocketForSwap: vi.fn(() => null),
      clearSocket: vi.fn(),
      connect: vi.fn(),
    };
    const executor = new TransportCommandExecutor(harness);

    executor.scheduleFreshConnection();

    expect(harness.dispatchEvent).toHaveBeenCalledWith({
      type: "clear-reconnect-attempts",
    });
    expect(harness.setCloseIntent).toHaveBeenCalledWith("fresh");
    expect(harness.closeActiveSocket).toHaveBeenCalledWith(
      TERMINAL_CLOSE_CODE.START_FRESH_SESSION,
      "start fresh session",
    );
    expect(harness.connect).not.toHaveBeenCalled();
  });

  it("emits socket-closed when disposing without an active socket", () => {
    const harness: CommandHarness = {
      dispatchEvent: vi.fn(),
      setCloseIntent: vi.fn(),
      clearLifecycleTimers: vi.fn(),
      closeActiveSocket: vi.fn(() => false),
      detachSocketForSwap: vi.fn(() => null),
      clearSocket: vi.fn(),
      connect: vi.fn(),
    };
    const executor = new TransportCommandExecutor(harness);

    executor.dispose();

    expect(harness.setCloseIntent).toHaveBeenCalledWith("dispose");
    expect(harness.clearLifecycleTimers).toHaveBeenCalledTimes(1);
    expect(harness.closeActiveSocket).toHaveBeenCalledWith(
      1000,
      "component unmount",
    );
    expect(harness.clearSocket).toHaveBeenCalledTimes(1);
    expect(harness.dispatchEvent).toHaveBeenCalledWith({
      type: "socket-closed",
    });
  });
});
