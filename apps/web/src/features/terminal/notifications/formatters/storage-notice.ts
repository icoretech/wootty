import type { StorageNotice } from "../notice-contract";

export function toStorageNotice(details: StorageNotice): string {
  const reasonSuffix =
    details.reason && details.reason.length > 0 ? ` (${details.reason})` : "";
  return `Browser storage ${details.operation} failed for '${details.key}'${reasonSuffix}. In-memory state remains active.`;
}
