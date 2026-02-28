import {
  ACTIVE_SESSION_STORAGE_KEY,
  LAST_SESSION_STORAGE_KEY,
  SESSION_HISTORY_STORAGE_KEY,
} from "./storage-keys";
export { ACTIVE_SESSION_STORAGE_KEY, LAST_SESSION_STORAGE_KEY };

export function readStoredSessionId(
  storage: Storage,
  key: string,
): string | undefined {
  const sessionId = storage.getItem(key);
  if (!sessionId || sessionId.length === 0) {
    return undefined;
  }
  return sessionId;
}

export function storeSessionId(
  storage: Storage,
  key: string,
  sessionId: string,
): void {
  storage.setItem(key, sessionId);
}

export function clearStoredSessionId(storage: Storage, key: string): void {
  storage.removeItem(key);
}

export function readSessionHistory(storage: Storage): string[] {
  const raw = storage.getItem(SESSION_HISTORY_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((value): value is string => typeof value === "string")
      .filter((value) => value.length > 0);
  } catch {
    return [];
  }
}

export function writeSessionHistory(
  storage: Storage,
  sessions: string[],
): void {
  storage.setItem(SESSION_HISTORY_STORAGE_KEY, JSON.stringify(sessions));
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
