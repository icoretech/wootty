import { describe, expect, it } from "vitest";
import { toBackendResolutionNotice } from "../../../src/features/terminal/notifications/mappers/backend-resolution-notice";
import { toProtocolFailureNotice } from "../../../src/features/terminal/notifications/mappers/protocol-failure-notice";
import { toServerPolicyNotice } from "../../../src/features/terminal/notifications/mappers/server-error-policy-notice";

describe("notice mapper adapters", () => {
  it("maps backend resolution issues to bootstrap notices", () => {
    expect(
      toBackendResolutionNotice({
        code: "socket_url_invalid_format",
        details: "invalid endpoint",
      }),
    ).toEqual({
      context: "bootstrap",
      reason: "backend_resolution_failed",
      code: "socket_url_invalid_format",
      details: "invalid endpoint",
    });

    expect(
      toBackendResolutionNotice({
        details: "missing endpoint",
      }),
    ).toEqual({
      context: "bootstrap",
      reason: "backend_resolution_failed",
      code: undefined,
      details: "missing endpoint",
    });
  });

  it("maps protocol failures without losing malformed payload details", () => {
    expect(
      toProtocolFailureNotice({
        reason: "malformed_payload",
        detail: "json_parse_error",
        cause: new Error("bad payload"),
      }),
    ).toEqual({
      context: "protocol",
      reason: "malformed_payload",
      detail: "json_parse_error",
      cause: expect.any(Error),
    });

    expect(
      toProtocolFailureNotice({
        reason: "unsupported_type",
      }),
    ).toEqual({
      context: "protocol",
      reason: "unsupported_type",
    });
  });

  it("maps server policy payloads into server notices", () => {
    expect(
      toServerPolicyNotice({
        reason: "missing_code",
      }),
    ).toEqual({
      context: "server",
      reason: "missing_code",
    });

    expect(
      toServerPolicyNotice({
        reason: "session_not_found",
      }),
    ).toEqual({
      context: "server",
      reason: "session_not_found",
    });
  });
});
