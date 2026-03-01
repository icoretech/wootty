import type {
  NoticePublisher,
  StorageNotice,
} from "../../notifications/notice-contract";
import type { StorageAccessFailure } from "../persistence/session-storage";

function describeStorageFailureReason(
  failure: StorageAccessFailure,
): string | undefined {
  if (failure.reason === "schema_mismatch") {
    return "stored value schema mismatch";
  }
  if (failure.reason === "invalid_value") {
    return "stored value invalid";
  }
  if (failure.cause instanceof Error && failure.cause.message.length > 0) {
    return failure.cause.message;
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

export function publishStorageFailureNotice(
  publishNotice: NoticePublisher,
  failure: StorageAccessFailure,
): void {
  publishNotice(toStorageFailureNoticeDetails(failure));
}
