import { describe, expect, it } from "vitest";
import { TRANSPORT_READY_STATE } from "../../../src/features/terminal/contracts/transport";
import { createWebSocketMockHarness } from "../../support/harness/socket-mock";
import { runTransportContractSuite } from "../../support/harness/transport-contract-suite";

runTransportContractSuite("socket mock transport contract", () => {
  const harness = createWebSocketMockHarness();
  const transport = harness.createTransport("ws://test.local");
  const ws = harness.instances[0];
  if (!ws) {
    throw new Error("socket mock instance was not created");
  }

  return {
    transport,
    open: () => {
      ws.triggerOpen();
    },
    emitMessage: (payload) => {
      ws.triggerMessage(payload);
    },
    emitError: (message, code) => {
      ws.triggerError(message, code);
    },
    sent: () => ws.sent,
  };
});

describe("socket mock harness", () => {
  it("updates ready state to open when triggered", () => {
    const harness = createWebSocketMockHarness();
    const ws = harness.createTransport("ws://test.local");
    expect(ws.readyState).toBe(TRANSPORT_READY_STATE.CONNECTING);

    harness.instances[0]?.triggerOpen();
    expect(ws.readyState).toBe(TRANSPORT_READY_STATE.OPEN);
  });

  it("emits close metadata and updates state", () => {
    const harness = createWebSocketMockHarness();
    const ws = harness.createTransport("ws://test.local");
    const closeEvents: Array<{ code: number; reason: string }> = [];
    ws.addEventListener("close", (event) => {
      closeEvents.push(event);
    });

    ws.close(4101, "manual reconnect");
    expect(ws.readyState).toBe(TRANSPORT_READY_STATE.CLOSED);
    expect(closeEvents).toEqual([{ code: 4101, reason: "manual reconnect" }]);
  });
});
