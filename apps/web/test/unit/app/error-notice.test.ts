import { describe, expect, it } from "vitest";
import { toUserNotice } from "../../../src/features/terminal/notifications/user-notice";

describe("error notice mapping", () => {
  it("formats session refresh notices", () => {
    expect(toUserNotice({ context: "sessions_refresh" })).toBe(
      "Unable to refresh live sessions.",
    );
    expect(toUserNotice({ context: "sessions_refresh", status: 503 })).toBe(
      "Unable to refresh live sessions (HTTP 503).",
    );
  });

  it("formats protocol notices", () => {
    expect(
      toUserNotice({
        context: "protocol",
        parseReason: "unsupported_type",
      }),
    ).toBe("Received an unsupported server message type.");
    expect(
      toUserNotice({
        context: "protocol",
        parseReason: "malformed_payload",
      }),
    ).toBe("Received a malformed server payload.");
  });

  it("includes cause context when available", () => {
    expect(
      toUserNotice({
        context: "sessions_refresh",
        cause: new Error("network down"),
      }),
    ).toContain("network down");
    expect(
      toUserNotice({
        context: "fullscreen",
        cause: new Error("permission denied"),
      }),
    ).toContain("permission denied");
  });
});
