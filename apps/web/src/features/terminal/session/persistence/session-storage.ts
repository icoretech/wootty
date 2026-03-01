import {
  SESSION_HISTORY_STORAGE_KEY,
  type SessionStorageKey,
} from "./storage-keys";

export type StorageAccessFailure = {
  operation: "read" | "write" | "remove" | "parse";
  key: string;
  reason?: "schema_mismatch" | "invalid_value";
  cause?: unknown;
};

type StorageReadSessionIdResult = {
  sessionId: string | null;
  error: StorageAccessFailure | null;
};

type StorageReadSessionHistoryResult = {
  sessions: string[];
  error: StorageAccessFailure | null;
};

type StorageMutationResult = {
  error: StorageAccessFailure | null;
};

export function readStoredSessionIdResult(
  storage: Storage,
  key: SessionStorageKey,
): StorageReadSessionIdResult {
  try {
    const sessionId = storage.getItem(key);
    if (!sessionId || sessionId.length === 0) {
      return {
        sessionId: null,
        error: null,
      };
    }
    return {
      sessionId,
      error: null,
    };
  } catch (cause) {
    return {
      sessionId: null,
      error: {
        operation: "read",
        key,
        cause,
      },
    };
  }
}

export function storeSessionIdResult(
  storage: Storage,
  key: SessionStorageKey,
  sessionId: string,
): StorageMutationResult {
  try {
    storage.setItem(key, sessionId);
    return { error: null };
  } catch (cause) {
    return {
      error: {
        operation: "write",
        key,
        cause,
      },
    };
  }
}

export function clearStoredSessionIdResult(
  storage: Storage,
  key: SessionStorageKey,
): StorageMutationResult {
  try {
    storage.removeItem(key);
    return { error: null };
  } catch (cause) {
    return {
      error: {
        operation: "remove",
        key,
        cause,
      },
    };
  }
}

export function readSessionHistoryResult(
  storage: Storage,
): StorageReadSessionHistoryResult {
  let raw: string | null = null;
  try {
    raw = storage.getItem(SESSION_HISTORY_STORAGE_KEY);
  } catch (cause) {
    return {
      sessions: [],
      error: {
        operation: "read",
        key: SESSION_HISTORY_STORAGE_KEY,
        cause,
      },
    };
  }
  if (!raw) {
    return {
      sessions: [],
      error: null,
    };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return {
        sessions: [],
        error: {
          operation: "parse",
          key: SESSION_HISTORY_STORAGE_KEY,
          reason: "schema_mismatch",
          cause: parsed,
        },
      };
    }

    const sessions = parsed
      .filter((value): value is string => typeof value === "string")
      .filter((value) => value.length > 0);
    if (sessions.length !== parsed.length) {
      return {
        sessions,
        error: {
          operation: "parse",
          key: SESSION_HISTORY_STORAGE_KEY,
          reason: "schema_mismatch",
          cause: {
            invalidEntries: parsed.length - sessions.length,
            totalEntries: parsed.length,
          },
        },
      };
    }

    return {
      sessions,
      error: null,
    };
  } catch (cause) {
    return {
      sessions: [],
      error: {
        operation: "parse",
        key: SESSION_HISTORY_STORAGE_KEY,
        reason: "invalid_value",
        cause,
      },
    };
  }
}

export function writeSessionHistoryResult(
  storage: Storage,
  sessions: string[],
): StorageMutationResult {
  try {
    storage.setItem(SESSION_HISTORY_STORAGE_KEY, JSON.stringify(sessions));
    return { error: null };
  } catch (cause) {
    return {
      error: {
        operation: "write",
        key: SESSION_HISTORY_STORAGE_KEY,
        cause,
      },
    };
  }
}

export function pushSessionHistory(
  sessions: string[],
  sessionId: string,
  maxEntries = 8,
): string[] {
  const unique = [
    sessionId,
    ...sessions.filter((value) => value !== sessionId),
  ];
  return unique.slice(0, maxEntries);
}
