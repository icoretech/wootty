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

/**
 * Generic helper for storage operations with consistent error handling.
 * Reduces boilerplate by wrapping try-catch patterns in a reusable function.
 */
export function withStorageErrorHandling<T>(
  operation: StorageAccessOperation,
  key: string,
  fn: () => T,
): { value: T | null; error: StorageAccessFailure | null } {
  try {
    return { value: fn(), error: null };
  } catch (cause) {
    return {
      value: null,
      error: {
        operation,
        key,
        cause,
      },
    };
  }
}
