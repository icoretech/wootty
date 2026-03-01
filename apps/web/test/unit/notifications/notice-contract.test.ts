import { describe, expect, it } from "vitest";
import type { BackendResolutionIssueCode } from "../../../src/features/terminal/contracts/backend-resolution";
import type {
  NoticeBootstrapIssueCode,
  NoticeDetails,
  NoticeProtocolFailureDetail,
  NoticeServerErrorReason,
} from "../../../src/features/terminal/contracts/notice";
import { NOTICE_CONTEXTS } from "../../../src/features/terminal/notifications/user-notice";
import type { TerminalServerErrorCode } from "../../../src/features/terminal/protocol/server-error-codes";
import type { TerminalProtocolFailureDetail } from "../../../src/features/terminal/protocol/terminal-protocol";

type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type AssertTrue<T extends true> = T;

type _ProtocolFailureDetailParity = AssertTrue<
  IsEqual<NoticeProtocolFailureDetail, TerminalProtocolFailureDetail>
>;
type _ServerErrorReasonParity = AssertTrue<
  IsEqual<NoticeServerErrorReason, TerminalServerErrorCode>
>;
type _BootstrapIssueCodeParity = AssertTrue<
  IsEqual<NoticeBootstrapIssueCode, BackendResolutionIssueCode>
>;

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
      {
        context: "transport",
        source: "error",
        reasonCode: "socket_failure",
        debugDetail: "boom",
      },
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
