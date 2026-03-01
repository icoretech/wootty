import type { BackendResolutionIssueCode } from "../../contracts/backend-resolution";
import {
  type BootstrapNotice,
  NOTICE_BOOTSTRAP_ISSUE_CODES,
  type NoticeBootstrapIssueCode,
} from "../../contracts/notice";

function toNoticeBootstrapIssueCode(
  code?: BackendResolutionIssueCode,
): NoticeBootstrapIssueCode | undefined {
  if (!code) {
    return undefined;
  }
  if ((NOTICE_BOOTSTRAP_ISSUE_CODES as readonly string[]).includes(code)) {
    return code;
  }
  return undefined;
}

export function toBackendResolutionNotice(issue: {
  details: string;
  code?: BackendResolutionIssueCode;
}): BootstrapNotice {
  return {
    context: "bootstrap",
    reason: "backend_resolution_failed",
    details: issue.details,
    code: toNoticeBootstrapIssueCode(issue.code),
  };
}
