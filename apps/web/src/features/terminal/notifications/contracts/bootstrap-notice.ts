import {
  BACKEND_RESOLUTION_ISSUE_CODES,
  type BackendResolutionIssueCode,
} from "../../contracts/backend-resolution";

export const NOTICE_BOOTSTRAP_ISSUE_CODES = BACKEND_RESOLUTION_ISSUE_CODES;

export type NoticeBootstrapIssueCode = BackendResolutionIssueCode;

export type BootstrapNotice = {
  context: "bootstrap";
  reason: "backend_resolution_failed";
  details: string;
  code?: NoticeBootstrapIssueCode;
};
