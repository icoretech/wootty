import type { StorageAccessFailure } from "../session/persistence/session-storage";

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
  try {
    return {
      storage: window[kind],
      error: null,
    };
  } catch (cause) {
    return {
      storage: null,
      error: {
        operation: "read",
        key: kind,
        cause,
      },
    };
  }
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
