import { describe, expect, it } from "vitest";
import { toProtocolNotice } from "../../../src/features/terminal/notifications/formatters/protocol-notice";
import { toRuntimeNotice } from "../../../src/features/terminal/notifications/formatters/runtime-notice";
import { toServerNotice } from "../../../src/features/terminal/notifications/formatters/server-notice";
import { toSessionRefreshNotice } from "../../../src/features/terminal/notifications/formatters/session-refresh-notice";
import { toTransportNotice } from "../../../src/features/terminal/notifications/formatters/transport-notice";
import { normalizeCauseToMessage } from "../../../src/features/terminal/shared/sanitization/normalize-cause-message";

describe("notice formatters direct coverage", () => {
  it("normalizes causes with trimming, redaction, and fallback handling", () => {
    expect(normalizeCauseToMessage(null)).toBeNull();
    expect(
      normalizeCauseToMessage("  https://host/path?token=secret&x=1  "),
    ).toContain("token=[redacted]");
    expect(normalizeCauseToMessage(new Error("boom"))).toBe("boom");
    expect(normalizeCauseToMessage({ reason: "bad" })).toContain("reason");
  });

  it("formats protocol notices with details and cause context", () => {
    expect(
      toProtocolNotice({
        context: "protocol",
        reason: "unsupported_type",
        rawType: "future",
      }),
    ).toBe("Received an unsupported server message type (type=future).");
    expect(
      toProtocolNotice({
        context: "protocol",
        reason: "malformed_payload",
        detail: "invalid_output_data",
        cause: "bad payload",
      }),
    ).toBe(
      "Received a malformed server payload [detail=invalid_output_data] (bad payload).",
    );
  });

  it("formats runtime and session refresh notices with deterministic copy", () => {
    expect(
      toRuntimeNotice({
        context: "runtime",
        reason: "xterm init failed",
      }),
    ).toBe("Unable to start terminal runtime (xterm init failed).");
    expect(
      toSessionRefreshNotice({
        context: "sessions_refresh",
        reason: "invalid_entries",
        count: 1,
      }),
    ).toBe("Skipped 1 malformed session entry.");
    expect(
      toSessionRefreshNotice({
        context: "sessions_refresh",
        reason: "invalid_entries",
        count: 3,
      }),
    ).toBe("Skipped 3 malformed session entries.");
    expect(
      toSessionRefreshNotice({
        context: "sessions_refresh",
        reason: "request_timeout",
        timeoutMs: 15_000,
      }),
    ).toBe("Unable to refresh live sessions (request timed out after 15s).");
  });

  it("formats server and transport notices including metadata suffixes", () => {
    expect(
      toServerNotice({
        context: "server",
        reason: "session_not_writable",
      }),
    ).toContain("not writable");
    expect(
      toServerNotice({
        context: "server",
        reason: "raw_code",
        code: "SOMETHING_NEW",
      }),
    ).toContain("SOMETHING_NEW");
    expect(
      toTransportNotice({
        context: "transport",
        reasonCode: "socket_failure",
        source: "close",
        code: 1006,
        debugDetail: "abnormal closure",
        cause: "abnormal closure",
      }),
    ).toBe(
      "Connection problem (transport failure). (close code=1006 detail=abnormal closure)",
    );
    expect(
      toTransportNotice({
        context: "transport",
        reasonCode: "bootstrap_failed",
        source: "error",
        debugDetail: "failed wss://host/api/terminal?token=secret",
      }),
    ).toContain("token=[redacted]");
    expect(
      toTransportNotice({
        context: "transport",
        reasonCode: "bootstrap_failed",
        source: "error",
        debugDetail: "failed wss://host/api/terminal?token=secret",
      }),
    ).not.toContain("token=secret");
  });
});
