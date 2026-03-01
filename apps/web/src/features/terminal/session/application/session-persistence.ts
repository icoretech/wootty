import { useCallback, useMemo, useState } from "react";
import type { StorageAccessResult } from "../../contracts/storage-access";
import type { StorageAccessFailure } from "../persistence/session-storage";
import {
  clearStoredSessionIdResult,
  pushSessionHistory,
  readSessionHistoryResult,
  readStoredSessionIdResult,
  storeSessionIdResult,
  writeSessionHistoryResult,
} from "../persistence/session-storage";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  LAST_SESSION_STORAGE_KEY,
} from "../persistence/storage-keys";

type UseSessionPersistenceArgs = {
  getLocalStorage: () => StorageAccessResult;
  getSessionStorage: () => StorageAccessResult;
  onStorageFailure?: (failure: StorageAccessFailure) => void;
};

type SessionPersistenceState = {
  sessionId: string | null;
  lastSessionId: string | null;
  sessionHistoryIds: string[];
};

type SessionPersistenceActions = {
  setSessionId: (nextSessionId: string | null) => void;
  clearActiveSessionStorage: () => void;
  persistActiveSessionStorage: (nextSessionId: string) => void;
  rememberSession: (nextSessionId: string) => void;
};

type SessionPersistence = {
  state: SessionPersistenceState;
  actions: SessionPersistenceActions;
};

function reportFailure(
  failure: StorageAccessFailure | null,
  onStorageFailure?: (failure: StorageAccessFailure) => void,
): void {
  if (!failure || !onStorageFailure) {
    return;
  }
  onStorageFailure(failure);
}

function resolveStorageAccess(
  access: StorageAccessResult,
  onStorageFailure?: (failure: StorageAccessFailure) => void,
): Storage | null {
  reportFailure(access.error, onStorageFailure);
  return access.storage;
}

export function useSessionPersistence({
  getLocalStorage,
  getSessionStorage,
  onStorageFailure,
}: UseSessionPersistenceArgs): SessionPersistence {
  const initialSessionId = useMemo(() => {
    const storage = resolveStorageAccess(getSessionStorage(), onStorageFailure);
    if (!storage) {
      return null;
    }
    const read = readStoredSessionIdResult(storage, ACTIVE_SESSION_STORAGE_KEY);
    reportFailure(read.error, onStorageFailure);
    return read.sessionId;
  }, [getSessionStorage, onStorageFailure]);

  const initialLastSessionId = useMemo(() => {
    const storage = resolveStorageAccess(getLocalStorage(), onStorageFailure);
    if (!storage) {
      return null;
    }
    const read = readStoredSessionIdResult(storage, LAST_SESSION_STORAGE_KEY);
    reportFailure(read.error, onStorageFailure);
    return read.sessionId;
  }, [getLocalStorage, onStorageFailure]);

  const initialSessionHistory = useMemo(() => {
    const storage = resolveStorageAccess(getLocalStorage(), onStorageFailure);
    if (!storage) {
      return [];
    }
    const read = readSessionHistoryResult(storage);
    reportFailure(read.error, onStorageFailure);
    return read.sessions;
  }, [getLocalStorage, onStorageFailure]);

  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [lastSessionId, setLastSessionId] = useState<string | null>(
    initialLastSessionId,
  );
  const [sessionHistoryIds, setSessionHistoryIds] = useState<string[]>(
    initialSessionHistory,
  );

  const clearActiveSessionStorage = useCallback(() => {
    const storage = resolveStorageAccess(getSessionStorage(), onStorageFailure);
    if (!storage) {
      return;
    }
    const cleared = clearStoredSessionIdResult(
      storage,
      ACTIVE_SESSION_STORAGE_KEY,
    );
    reportFailure(cleared.error, onStorageFailure);
  }, [getSessionStorage, onStorageFailure]);

  const persistActiveSessionStorage = useCallback(
    (nextSessionId: string) => {
      const storage = resolveStorageAccess(
        getSessionStorage(),
        onStorageFailure,
      );
      if (!storage) {
        return;
      }
      const stored = storeSessionIdResult(
        storage,
        ACTIVE_SESSION_STORAGE_KEY,
        nextSessionId,
      );
      reportFailure(stored.error, onStorageFailure);
    },
    [getSessionStorage, onStorageFailure],
  );

  const rememberSession = useCallback(
    (nextSessionId: string) => {
      const localStorageRef = resolveStorageAccess(
        getLocalStorage(),
        onStorageFailure,
      );
      if (!localStorageRef) {
        return;
      }

      const storedLast = storeSessionIdResult(
        localStorageRef,
        LAST_SESSION_STORAGE_KEY,
        nextSessionId,
      );
      reportFailure(storedLast.error, onStorageFailure);

      const historyRead = readSessionHistoryResult(localStorageRef);
      reportFailure(historyRead.error, onStorageFailure);
      const nextHistory = pushSessionHistory(
        historyRead.sessions,
        nextSessionId,
      );
      const historyWrite = writeSessionHistoryResult(
        localStorageRef,
        nextHistory,
      );
      reportFailure(historyWrite.error, onStorageFailure);

      setSessionHistoryIds(nextHistory);
      setLastSessionId(nextSessionId);
    },
    [getLocalStorage, onStorageFailure],
  );

  return {
    state: {
      sessionId,
      lastSessionId,
      sessionHistoryIds,
    },
    actions: {
      setSessionId,
      clearActiveSessionStorage,
      persistActiveSessionStorage,
      rememberSession,
    },
  };
}
