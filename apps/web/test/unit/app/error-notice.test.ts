import { describe, expect, it } from "vitest";
import { toUserNotice } from "../../../src/features/terminal/notifications/user-notice";

describe("error notice mapping", () => {
  it("formats session refresh notices", () => {
    expect(
      toUserNotice({ context: "sessions_refresh", reason: "generic" }),
    ).toBe("Unable to refresh live sessions.");
    expect(
      toUserNotice({
        context: "sessions_refresh",
        reason: "http",
        status: 503,
      }),
    ).toBe("Unable to refresh live sessions (HTTP 503).");
  });

  it("formats protocol notices", () => {
    expect(
      toUserNotice({
        context: "protocol",
        reason: "unsupported_type",
      }),
    ).toBe("Received an unsupported server message type.");
    expect(
      toUserNotice({
        context: "protocol",
        reason: "malformed_payload",
      }),
    ).toBe("Received a malformed server payload.");
    expect(
      toUserNotice({
        context: "protocol",
        reason: "empty_transport_message",
      }),
    ).toBe(
      "Received an empty transport payload; expected a JSON server message.",
    );
    expect(
      toUserNotice({
        context: "protocol",
        reason: "malformed_transport_event",
        details: "code,data",
      }),
    ).toBe("Received malformed transport event (code,data).");
  });

  it("includes cause context when available", () => {
    expect(
      toUserNotice({
        context: "sessions_refresh",
        reason: "cause",
        cause: new Error("network down"),
      }),
    ).toContain("network down");
    expect(
      toUserNotice({
        context: "fullscreen",
        cause: new Error("permission denied"),
      }),
    ).toContain("permission denied");
    expect(
      toUserNotice({
        context: "runtime",
        reason: "xterm chunk failed",
      }),
    ).toContain("xterm chunk failed");
  });

  it("maps transport reason codes with deterministic messages", () => {
    expect(
      toUserNotice({
        context: "transport",
        reasonCode: "attach_handshake_send_failed",
      }),
    ).toBe("Connection problem during attach handshake.");
    expect(
      toUserNotice({
        context: "transport",
        reasonCode: "socket_failure",
        source: "close",
        code: 1006,
        debugDetail: "abnormal closure",
      }),
    ).toContain("Connection problem (transport failure).");
  });
});
