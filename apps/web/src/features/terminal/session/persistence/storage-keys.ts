export const ACTIVE_SESSION_STORAGE_KEY = "wootty.activeSessionId";
export const LAST_SESSION_STORAGE_KEY = "wootty.lastSessionId";
export const SESSION_HISTORY_STORAGE_KEY = "wootty.sessionHistory";

export type SessionStorageKey =
  | typeof ACTIVE_SESSION_STORAGE_KEY
  | typeof LAST_SESSION_STORAGE_KEY;
