import { describe, expect, it, vi } from "vitest";
import type { TerminalTransport } from "../../../src/features/terminal/contracts/transport";
import { TRANSPORT_READY_STATE } from "../../../src/features/terminal/contracts/transport";

type TransportContractHarness = {
  transport: TerminalTransport;
  open: () => void;
  emitMessage: (payload: unknown) => void;
  emitError: (message?: string) => void;
  sent: () => string[];
};

type TransportHarnessFactory = () => TransportContractHarness;

export function runTransportContractSuite(
  name: string,
  createHarness: TransportHarnessFactory,
): void {
  describe(name, () => {
    it("starts in connecting state", () => {
      const harness = createHarness();
      expect(harness.transport.readyState).toBe(
        TRANSPORT_READY_STATE.CONNECTING,
      );
    });

    it("rejects send before open", () => {
      const harness = createHarness();
      expect(() => harness.transport.send("ping")).toThrow();
    });

    it("sends payloads after open", () => {
      const harness = createHarness();
      harness.open();
      harness.transport.send("ping");
      expect(harness.sent()).toEqual(["ping"]);
    });

    it("emits normalized message payloads", () => {
      const harness = createHarness();
      const onMessage = vi.fn();
      harness.transport.addEventListener("message", onMessage);
      harness.open();
      harness.emitMessage({ type: "ready", sessionId: "s-1" });
      expect(onMessage).toHaveBeenCalledWith({
        data: '{"type":"ready","sessionId":"s-1"}',
      });
    });

    it("emits transport-scoped error events", () => {
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
    });
  });
}
