import { describe, expect, it } from "vitest";
import { isBackendResolutionIssueCode } from "../../../src/features/terminal/contracts/backend-resolution";

describe("backend resolution issue code", () => {
  it("accepts only declared issue-code literals", () => {
    expect(isBackendResolutionIssueCode("env_socket_url_invalid_format")).toBe(
      true,
    );
    expect(
      isBackendResolutionIssueCode("socket_url_unsupported_protocol"),
    ).toBe(true);
    expect(isBackendResolutionIssueCode("unknown_issue")).toBe(false);
    expect(isBackendResolutionIssueCode(5)).toBe(false);
  });
});
