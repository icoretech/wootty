import { describe, expect, it } from "vitest";
import {
  resolveServerErrorPolicy,
  type ServerErrorNoticePayload,
} from "../../../src/features/terminal/protocol/policies/server-error-policy";
import { TERMINAL_SERVER_ERROR_CODES } from "../../../src/features/terminal/protocol/server-error-codes";

function noticeReason(payload: ServerErrorNoticePayload): string {
  return payload.reason;
}

describe("server error policy", () => {
  it("maps every known server code to a deterministic notice reason", () => {
    const reasons = new Set<string>();
    for (const code of TERMINAL_SERVER_ERROR_CODES) {
      const result = resolveServerErrorPolicy({ code });
      reasons.add(noticeReason(result.notice));
    }

    expect(reasons).toEqual(
      new Set([
        "session_not_found",
        "attach_forbidden",
        "incompatible_version",
        "attach_required",
        "read_only_forbidden",
        "session_not_writable",
        "session_not_resizable",
      ]),
    );
  });

  it("treats unknown raw codes as non-fatal server notices", () => {
    expect(
      resolveServerErrorPolicy({
        rawCode: "custom_error",
      }),
    ).toEqual({
      notice: {
        reason: "raw_code",
        code: "custom_error",
      },
    });
  });

  it("returns missing_code when no known or raw server code is present", () => {
    expect(resolveServerErrorPolicy({})).toEqual({
      notice: {
        reason: "missing_code",
      },
    });
  });
});
