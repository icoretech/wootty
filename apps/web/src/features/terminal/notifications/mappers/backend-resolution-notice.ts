import type { BackendResolutionIssueCode } from "../../contracts/backend-resolution";
import type { BootstrapNotice } from "../../contracts/notice";

export function toBackendResolutionNotice(issue: {
  details: string;
  code?: BackendResolutionIssueCode;
}): BootstrapNotice {
  return {
    context: "bootstrap",
    reason: "backend_resolution_failed",
    details: issue.details,
    code: issue.code,
  };
}
