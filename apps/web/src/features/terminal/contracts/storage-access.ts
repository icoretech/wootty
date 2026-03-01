export type StorageAccessOperation = "read" | "write" | "remove" | "parse";

export type StorageAccessFailureReason = "schema_mismatch" | "invalid_value";

export type StorageAccessFailure = {
  operation: StorageAccessOperation;
  key: string;
  reason?: StorageAccessFailureReason;
  cause?: unknown;
};

export type StorageAccessResult = {
  storage: Storage | null;
  error: StorageAccessFailure | null;
};
