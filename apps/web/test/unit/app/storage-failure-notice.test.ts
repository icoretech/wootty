import { describe, expect, it } from "vitest";
import { toStorageFailureNoticeDetails } from "../../../src/features/terminal/notifications/mappers/storage-failure-notice";
import { toUserNotice } from "../../../src/features/terminal/notifications/user-notice";

describe("storage failure notice", () => {
  it("maps schema mismatch parse failures to stable wording", () => {
    expect(
      toUserNotice(
        toStorageFailureNoticeDetails({
          operation: "parse",
          key: "wootty.sessionHistory",
          reason: "schema_mismatch",
        }),
      ),
    ).toContain("stored value schema mismatch");
  });

  it("maps invalid stored values and runtime errors", () => {
    expect(
      toUserNotice(
        toStorageFailureNoticeDetails({
          operation: "parse",
          key: "wootty.fontSize",
          reason: "invalid_value",
        }),
      ),
    ).toContain("stored value invalid");

    expect(
      toUserNotice(
        toStorageFailureNoticeDetails({
          operation: "write",
          key: "wootty.fontSize",
          cause: new Error("quota exceeded"),
        }),
      ),
    ).toContain("quota exceeded");
  });
});
