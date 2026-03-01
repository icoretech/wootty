import { describe, expect, it } from "vitest";
import { buildDocumentTitle } from "../../../../src/features/terminal/presentation/document-title";

describe("document title", () => {
  it("builds watch-mode title when session id is pending", () => {
    expect(
      buildDocumentTitle({
        attachMode: "watch",
        sessionId: null,
        status: "connecting",
      }),
    ).toBe("WATCH pending CONNECTING · WooTTY");
  });

  it("truncates long session ids and uppercases status", () => {
    expect(
      buildDocumentTitle({
        attachMode: "control",
        sessionId: "1234567890abcdef",
        status: "connected",
      }),
    ).toBe("LIVE 12345678…cdef CONNECTED · WooTTY");
  });
});
