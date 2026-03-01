import type { StorageAccessFailure } from "../../contracts/storage-access";
import { normalizeCauseToMessage } from "../../shared/sanitization/normalize-cause-message";
import type { StorageNotice } from "../contracts/session-notice";

function describeStorageFailureReason(
  failure: StorageAccessFailure,
): string | undefined {
  if (failure.reason === "schema_mismatch") {
    return "stored value schema mismatch";
  }
  if (failure.reason === "invalid_value") {
    return "stored value invalid";
  }
  const normalizedCause = normalizeCauseToMessage(failure.cause);
  if (normalizedCause) {
    return normalizedCause;
  }
  return undefined;
}

export function toStorageFailureNoticeDetails(
  failure: StorageAccessFailure,
): StorageNotice {
  return {
    context: "storage",
    operation: failure.operation,
    key: failure.key,
    reason: describeStorageFailureReason(failure),
  };
}
