import type { StorageAccessFailure } from "../../contracts/storage-access";
import {
  clampFontSize,
  DEFAULT_FONT_SIZE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
} from "../../preferences/font-size-policy";

const FONT_SIZE_STORAGE_KEY = "wootty.fontSize";
export function readInitialFontSizeResult(storage: Storage | null): {
  fontSize: number;
  error: StorageAccessFailure | null;
} {
  if (!storage) {
    return { fontSize: DEFAULT_FONT_SIZE, error: null };
  }

  let raw: string | null = null;
  try {
    raw = storage.getItem(FONT_SIZE_STORAGE_KEY);
  } catch (cause) {
    return {
      fontSize: DEFAULT_FONT_SIZE,
      error: {
        operation: "read",
        key: FONT_SIZE_STORAGE_KEY,
        cause,
      },
    };
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
  try {
    storage.setItem(FONT_SIZE_STORAGE_KEY, String(clampFontSize(fontSize)));
    return { error: null };
  } catch (cause) {
    return {
      error: {
        operation: "write",
        key: FONT_SIZE_STORAGE_KEY,
        cause,
      },
    };
  }
}
