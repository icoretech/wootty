import { describe, expect, it } from "vitest";
import type { NoticeDetails } from "../../../src/features/terminal/notifications/notice-contract";
import { NOTICE_CONTEXTS } from "../../../src/features/terminal/notifications/user-notice";

describe("notice contract", () => {
  it("exposes a stable list of supported notice contexts", () => {
    expect(NOTICE_CONTEXTS).toEqual([
      "sessions_refresh",
      "fullscreen",
      "runtime",
      "protocol",
      "transport",
      "server",
      "bootstrap",
      "storage",
    ]);
  });

  it("keeps notice context unions assignable for every context", () => {
    const samples: NoticeDetails[] = [
      { context: "sessions_refresh", reason: "generic" },
      { context: "fullscreen" },
      { context: "runtime" },
      { context: "protocol", reason: "unsupported_type" },
      { context: "transport", source: "error", reason: "boom" },
      { context: "server", reason: "attach_required" },
      {
        context: "bootstrap",
        reason: "backend_resolution_failed",
        details: "invalid endpoint",
      },
      { context: "storage", operation: "read", key: "wootty.lastSession" },
    ];

    expect(samples).toHaveLength(NOTICE_CONTEXTS.length);
  });
});
