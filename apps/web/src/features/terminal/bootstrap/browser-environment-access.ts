import type { StorageAccessFailure } from "../contracts/storage-access";
import { withStorageErrorHandling } from "../contracts/storage-access";

type BrowserStorageKind = "localStorage" | "sessionStorage";

type BrowserStorageReadResult = {
  storage: Storage | null;
  error: StorageAccessFailure | null;
};

export function readStorageResult(
  kind: BrowserStorageKind,
): BrowserStorageReadResult {
  if (typeof window === "undefined") {
    return {
      storage: null,
      error: null,
    };
  }
  const { value: storage, error } = withStorageErrorHandling(
    "read",
    kind,
    () => window[kind],
  );
  return { storage, error };
}

export function readDocument(): Document | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document;
}

export function readWindow(): Window | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window;
}
