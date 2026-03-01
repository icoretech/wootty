import { describe, expect, it } from "vitest";
import { TRANSPORT_FAILURE_REASON_CODES } from "../../../src/features/terminal/contracts/transport/failure-reason";

describe("transport failure reason contract", () => {
  it("defines the canonical transport failure reason vocabulary", () => {
    expect(TRANSPORT_FAILURE_REASON_CODES).toEqual([
      "send_failed",
      "endpoint_unavailable",
      "endpoint_invalid_format",
      "endpoint_unsupported_protocol",
      "bootstrap_failed",
      "socket_failure",
    ]);
  });
});
