import { describe, expect, it } from "vitest";
import {
  createBackendResolutionIssue,
  isBackendResolutionIssue,
} from "../../../src/features/terminal/bootstrap/url/backend-resolution-issue";

describe("backend resolution issue helpers", () => {
  it("creates typed backend resolution issue payloads", () => {
    expect(
      createBackendResolutionIssue(
        "env_socket_url_invalid_format",
        "socket URL is malformed",
      ),
    ).toEqual({
      code: "env_socket_url_invalid_format",
      details: "socket URL is malformed",
    });
  });

  it("accepts only issue-like objects with string code/details", () => {
    expect(
      isBackendResolutionIssue({
        code: "socket_url_invalid_format",
        details: "details",
      }),
    ).toBe(true);
    expect(
      isBackendResolutionIssue({
        code: 42,
        details: "details",
      }),
    ).toBe(false);
    expect(
      isBackendResolutionIssue({
        code: "socket_url_invalid_format",
      }),
    ).toBe(false);
    expect(isBackendResolutionIssue(null)).toBe(false);
  });
});
