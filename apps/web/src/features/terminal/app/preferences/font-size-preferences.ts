import type { StorageAccessFailure } from "../../contracts/storage-access";
import { withStorageErrorHandling } from "../../contracts/storage-access";
import {
  clampFontSize,
  DEFAULT_FONT_SIZE,
} from "../../preferences/font-size-policy";

const FONT_SIZE_STORAGE_KEY = "wootty.fontSize";

export function readInitialFontSizeResult(storage: Storage | null): {
  fontSize: number;
  error: StorageAccessFailure | null;
} {
  if (!storage) {
    return { fontSize: DEFAULT_FONT_SIZE, error: null };
  }

  const { value: raw, error } = withStorageErrorHandling(
    "read",
    FONT_SIZE_STORAGE_KEY,
    () => storage.getItem(FONT_SIZE_STORAGE_KEY),
  );

  if (error) {
    return { fontSize: DEFAULT_FONT_SIZE, error };
  }

  if (!raw) {
    return { fontSize: DEFAULT_FONT_SIZE, error: null };
  }

  const normalized = raw.trim();
  if (!/^\d+$/u.test(normalized)) {
    return {
      fontSize: DEFAULT_FONT_SIZE,
      error: {
        operation: "parse",
        key: FONT_SIZE_STORAGE_KEY,
        reason: "invalid_value",
        cause: raw,
      },
    };
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed)) {
    return {
      fontSize: DEFAULT_FONT_SIZE,
      error: {
        operation: "parse",
        key: FONT_SIZE_STORAGE_KEY,
        reason: "invalid_value",
        cause: raw,
      },
    };
  }

  return {
    fontSize: clampFontSize(parsed),
    error: null,
  };
}

export function writeFontSizePreferenceResult(
  storage: Storage | null,
  fontSize: number,
): {
  error: StorageAccessFailure | null;
} {
  if (!storage) {
    return { error: null };
  }
  const { error } = withStorageErrorHandling(
    "write",
    FONT_SIZE_STORAGE_KEY,
    () =>
      storage.setItem(FONT_SIZE_STORAGE_KEY, String(clampFontSize(fontSize))),
  );
  return { error };
}
