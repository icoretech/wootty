import {
  isBackendResolutionIssueCode,
  type TerminalBackendResolutionIssue,
} from "../../contracts/backend-resolution";

export function createBackendResolutionIssue(
  code: TerminalBackendResolutionIssue["code"],
  details: string,
): TerminalBackendResolutionIssue {
  return {
    code,
    details,
  };
}

export function isBackendResolutionIssue(
  value: unknown,
): value is TerminalBackendResolutionIssue {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    isBackendResolutionIssueCode(candidate.code) &&
    typeof candidate.details === "string"
  );
}
