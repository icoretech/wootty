import { afterEach, describe, expect, it, vi } from "vitest";
import { TRANSPORT_READY_STATE } from "../../../src/features/terminal/contracts/transport";
import { createBrowserTransport } from "../../../src/features/terminal/orchestration/browser-transport";
import {
  BrowserSocketMock,
  createBrowserSocketMockHarness,
} from "../../support/harness/browser-socket-mock";
import { runTransportContractSuite } from "../../support/harness/transport-contract-suite";

const socketHarness = createBrowserSocketMockHarness();

afterEach(() => {
  socketHarness.reset();
});

runTransportContractSuite("browser transport contract", () => {
  const transport = createBrowserTransport(
    "ws://localhost",
    socketHarness.createSocket,
  );
  const raw = socketHarness.instances[0];
  if (!raw) {
    throw new Error("browser transport socket was not created");
  }

  return {
    transport,
    open: () => {
      raw.triggerOpen();
    },
    emitMessage: (payload) => {
      const data =
        typeof payload === "string" ? payload : JSON.stringify(payload);
      raw.emit("message", new MessageEvent("message", { data }));
    },
    emitError: (message, code) => {
      raw.triggerError(message, code);
    },
    sent: () => raw.sent,
  };
});

describe("browser transport adapter", () => {
  it("maps native ready states and close behavior", () => {
    const transport = createBrowserTransport(
      "ws://localhost",
      socketHarness.createSocket,
    );
    const raw = socketHarness.instances[0];
    expect(raw?.readyState).toBe(BrowserSocketMock.CONNECTING);
    expect(transport.readyState).toBe(TRANSPORT_READY_STATE.CONNECTING);

    if (!raw) {
      throw new Error("browser transport socket was not created");
    }

    raw.readyState = BrowserSocketMock.OPEN;
    expect(transport.readyState).toBe(TRANSPORT_READY_STATE.OPEN);
    expect(raw.sent).toEqual([]);

    transport.close(4101, "manual reconnect");
    expect(transport.readyState).toBe(TRANSPORT_READY_STATE.CLOSED);
  });

  it("normalizes malformed message and close events", () => {
    const transport = createBrowserTransport(
      "ws://localhost",
      socketHarness.createSocket,
    );
    const raw = socketHarness.instances[0];
    if (!raw) {
      throw new Error("browser transport socket was not created");
    }

    const onMessage = vi.fn();
    const onClose = vi.fn();
    transport.addEventListener("message", onMessage);
    transport.addEventListener("close", onClose);

    raw.emit("message", new MessageEvent("message", { data: { bad: true } }));
    raw.emit("close", new Event("close"));

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({
      data: "",
      malformed: "isTrusted",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith({ code: 1006, reason: "" });
  });

  it("removes listeners using the same callback reference", () => {
    const transport = createBrowserTransport(
      "ws://localhost",
      socketHarness.createSocket,
    );
    const raw = socketHarness.instances[0];
    if (!raw) {
      throw new Error("browser transport socket was not created");
    }

    const onError = vi.fn();
    transport.addEventListener("error", onError);
    transport.removeEventListener("error", onError);
    raw.emit("error", new ErrorEvent("error", { message: "boom" }));
    expect(raw.readyState).toBe(BrowserSocketMock.CONNECTING);

    expect(onError).not.toHaveBeenCalled();
  });

  it("deduplicates repeated callback registration per event type", () => {
    const transport = createBrowserTransport(
      "ws://localhost",
      socketHarness.createSocket,
    );
    const raw = socketHarness.instances[0];
    if (!raw) {
      throw new Error("browser transport socket was not created");
    }

    const onMessage = vi.fn();
    transport.addEventListener("message", onMessage);
    transport.addEventListener("message", onMessage);
    raw.emit("message", new MessageEvent("message", { data: "hello" }));
    expect(onMessage).toHaveBeenCalledTimes(1);

    transport.removeEventListener("message", onMessage);
    raw.emit("message", new MessageEvent("message", { data: "hello-again" }));
    expect(onMessage).toHaveBeenCalledTimes(1);
  });
});
