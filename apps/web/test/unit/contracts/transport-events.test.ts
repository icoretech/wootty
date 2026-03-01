import { describe, expect, it } from "vitest";
import {
  normalizeTransportCloseEvent,
  normalizeTransportErrorEvent,
  normalizeTransportMessageEvent,
  normalizeTransportOpenEvent,
} from "../../../src/features/terminal/adapters/transport-event-normalizer";

describe("transport event normalization", () => {
  // @trace FR-1 transport-contract-normalization
  it("normalizes open and message events", () => {
    expect(normalizeTransportOpenEvent()).toEqual({});
    expect(
      normalizeTransportMessageEvent(
        new MessageEvent("message", { data: "ping" }),
      ),
    ).toEqual({ data: "ping" });
    expect(normalizeTransportMessageEvent({ data: 10 })).toEqual({
      data: "",
      malformed: "data",
    });
  });

  it("normalizes close event fallback shape", () => {
    expect(normalizeTransportCloseEvent({})).toEqual({
      code: 1006,
      reason: "",
    });
    expect(
      normalizeTransportCloseEvent({ code: 4101, reason: "manual reconnect" }),
    ).toEqual({
      code: 4101,
      reason: "manual reconnect",
    });
  });

  it("normalizes error message and optional code/cause fields", () => {
    expect(normalizeTransportErrorEvent(new Error("boom"))).toEqual(
      expect.objectContaining({
        source: "transport",
        message: "boom",
      }),
    );

    expect(
      normalizeTransportErrorEvent({ message: "broken", code: "E_SOCKET" }),
    ).toEqual(
      expect.objectContaining({
        source: "transport",
        message: "broken",
        code: "E_SOCKET",
      }),
    );

    expect(normalizeTransportErrorEvent({ code: 500 })).toEqual(
      expect.objectContaining({
        source: "transport",
        message: "transport error (code)",
        code: 500,
      }),
    );
  });
});
