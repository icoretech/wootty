import { describe, expect, it } from "vitest";
import { redactTokenInUrlForNotice } from "../../../src/features/terminal/bootstrap/url/redact-token-in-url";

describe("redact token in url", () => {
  it("redacts token query params for valid urls", () => {
    expect(
      redactTokenInUrlForNotice(
        "wss://example.test/api/terminal?token=secret&mode=watch",
      ),
    ).toBe("wss://example.test/api/terminal?token=%5Bredacted%5D&mode=watch");
  });

  it("redacts token query params for raw strings", () => {
    expect(
      redactTokenInUrlForNotice("/api/terminal?token=secret&mode=watch"),
    ).toBe("/api/terminal?token=[redacted]&mode=watch");
  });
});
