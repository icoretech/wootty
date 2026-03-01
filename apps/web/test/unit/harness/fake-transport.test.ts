import { describe, expect, it } from "vitest";
import { FakeTransport } from "../../support/harness/fake-transport";
import { runTransportContractSuite } from "../../support/harness/transport-contract-suite";

runTransportContractSuite("fake transport contract", () => {
  const transport = new FakeTransport();

  return {
    transport,
    open: () => {
      transport.emitOpen();
    },
    emitMessage: (payload) => {
      transport.emitMessage({
        data: JSON.stringify(payload),
      });
    },
    emitError: (message, code) => {
      transport.emitError(message ?? "boom", {
        code,
      });
    },
    sent: () => transport.sentPayloads,
  };
});

describe("fake transport harness", () => {
  it("records close calls with explicit metadata", () => {
    const transport = new FakeTransport();

    transport.close(4101, "manual reconnect");

    expect(transport.closeCalls).toEqual([
      {
        code: 4101,
        reason: "manual reconnect",
      },
    ]);
  });
});
