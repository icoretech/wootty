import { describe, expect, it, vi } from "vitest";
import type { TerminalTransport } from "../../../src/features/terminal/contracts/transport";
import { TRANSPORT_READY_STATE } from "../../../src/features/terminal/contracts/transport";
import { TERMINAL_WIRE_CONTRACT_VERSION } from "../../../src/features/terminal/protocol/terminal-wire-schema";

type TransportContractHarness = {
  transport: TerminalTransport;
  open: () => void;
  emitMessage: (payload: unknown) => void;
  emitError: (message?: string, code?: string) => void;
  sent: () => string[];
};

type TransportHarnessFactory = () => TransportContractHarness;

function assertStartsInConnectingState(
  createHarness: TransportHarnessFactory,
): void {
  const harness = createHarness();
  expect(harness.transport.readyState).toBe(TRANSPORT_READY_STATE.CONNECTING);
}

function assertRejectsSendBeforeOpen(
  createHarness: TransportHarnessFactory,
): void {
  const harness = createHarness();
  expect(() => harness.transport.send("ping")).toThrow();
}

function assertSendsPayloadAfterOpen(
  createHarness: TransportHarnessFactory,
): void {
  const harness = createHarness();
  harness.open();
  harness.transport.send("ping");
  expect(harness.sent()).toEqual(["ping"]);
}

function assertNormalizesMessagePayload(
  createHarness: TransportHarnessFactory,
): void {
  const harness = createHarness();
  const onMessage = vi.fn();
  harness.transport.addEventListener("message", onMessage);
  harness.open();
  harness.emitMessage({
    type: "ready",
    version: TERMINAL_WIRE_CONTRACT_VERSION,
    sessionId: "s-1",
    readOnly: false,
  });
  expect(onMessage).toHaveBeenCalledWith({
    data: `{"type":"ready","version":${TERMINAL_WIRE_CONTRACT_VERSION},"sessionId":"s-1","readOnly":false}`,
  });
}

function assertTransportScopedError(
  createHarness: TransportHarnessFactory,
): void {
  const harness = createHarness();
  const onError = vi.fn();
  harness.transport.addEventListener("error", onError);
  harness.emitError("boom");
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({
      source: "transport",
      message: "boom",
    }),
  );
}

function assertOptionalErrorCode(createHarness: TransportHarnessFactory): void {
  const harness = createHarness();
  const onError = vi.fn();
  harness.transport.addEventListener("error", onError);
  harness.emitError("boom", "E_BROKEN");
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({
      source: "transport",
      message: "boom",
      code: "E_BROKEN",
    }),
  );
}

export function runTransportContractSuite(
  name: string,
  createHarness: TransportHarnessFactory,
): void {
  describe(name, () => {
    it(
      "starts in connecting state",
      assertStartsInConnectingState.bind(null, createHarness),
    );
    it(
      "rejects send before open",
      assertRejectsSendBeforeOpen.bind(null, createHarness),
    );
    it(
      "sends payloads after open",
      assertSendsPayloadAfterOpen.bind(null, createHarness),
    );
    it(
      "emits normalized message payloads",
      assertNormalizesMessagePayload.bind(null, createHarness),
    );
    it(
      "emits transport-scoped error events",
      assertTransportScopedError.bind(null, createHarness),
    );
    it(
      "keeps optional error code shape coherent",
      assertOptionalErrorCode.bind(null, createHarness),
    );
  });
}
