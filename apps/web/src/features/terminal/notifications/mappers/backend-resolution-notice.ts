import type { BackendResolutionIssueCode } from "../../contracts/backend-resolution";
import type {
  BootstrapNotice,
  NoticeBootstrapIssueCode,
} from "../contracts/bootstrap-notice";

function toNoticeBootstrapIssueCode(
  code?: BackendResolutionIssueCode,
): NoticeBootstrapIssueCode | undefined {
  return code;
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
