import { describe, expect, it } from "vitest";
import { TERMINAL_CLOSE_CODE } from "../../../../../src/features/terminal/app/engine/transport/transport-policy";
import { resolveTransportClosePlan } from "../../../../../src/features/terminal/app/engine/transport/transport-recovery-plan";

describe("transport recovery plan", () => {
  it("reconnects immediately for manual and fresh intents", () => {
    expect(
      resolveTransportClosePlan({
        closeIntent: "manual",
        closeCode: TERMINAL_CLOSE_CODE.MANUAL_RECONNECT,
        reconnectAttempt: 0,
      }),
    ).toEqual({ kind: "reconnect-immediate" });
    expect(
      resolveTransportClosePlan({
        closeIntent: "fresh",
        closeCode: TERMINAL_CLOSE_CODE.START_FRESH_SESSION,
        reconnectAttempt: 3,
      }),
    ).toEqual({ kind: "reconnect-immediate" });
  });

  it("marks dispose intent as terminal", () => {
    expect(
      resolveTransportClosePlan({
        closeIntent: "dispose",
        closeCode: 1000,
        reconnectAttempt: 0,
      }),
    ).toEqual({ kind: "disposed" });
  });

  it("schedules reconnect while attempts remain", () => {
    expect(
      resolveTransportClosePlan({
        closeIntent: "normal",
        closeCode: 1006,
        reconnectAttempt: 2,
      }),
    ).toMatchObject({
      kind: "schedule-reconnect",
      nextAttempt: 3,
    });
  });

  it("fails when reconnect attempts are exhausted", () => {
    expect(
      resolveTransportClosePlan({
        closeIntent: "normal",
        closeCode: 1006,
        reconnectAttempt: 8,
      }),
    ).toEqual({
      kind: "reconnect-exhausted",
      attempt: 8,
    });
  });
});
