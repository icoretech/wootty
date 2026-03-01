import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSessionPersistence } from "../../../src/features/terminal/session/application/session-persistence";
import type { StorageAccessFailure } from "../../../src/features/terminal/session/persistence/session-storage";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  LAST_SESSION_STORAGE_KEY,
  SESSION_HISTORY_STORAGE_KEY,
} from "../../../src/features/terminal/session/persistence/storage-keys";
import { StorageDouble } from "../../support/harness/storage-double";

type PersistenceProbeProps = {
  localStorageRef: Storage;
  sessionStorageRef: Storage;
  onStorageFailure?: (failure: StorageAccessFailure) => void;
};

function PersistenceProbe({
  localStorageRef,
  sessionStorageRef,
  onStorageFailure,
}: PersistenceProbeProps) {
  const persistence = useSessionPersistence({
    getLocalStorage: () => ({ storage: localStorageRef, error: null }),
    getSessionStorage: () => ({ storage: sessionStorageRef, error: null }),
    onStorageFailure,
  });

  return (
    <section>
      <output data-testid="session-id">{persistence.state.sessionId}</output>
      <output data-testid="last-session-id">
        {persistence.state.lastSessionId}
      </output>
      <output data-testid="history">
        {persistence.state.sessionHistoryIds.join(",")}
      </output>
      <button
        type="button"
        data-testid="remember"
        onClick={() => {
          persistence.actions.rememberSession("session-b");
        }}
      >
        remember
      </button>
      <button
        type="button"
        data-testid="persist-active"
        onClick={() => {
          persistence.actions.persistActiveSessionStorage("session-b");
        }}
      >
        persist-active
      </button>
      <button
        type="button"
        data-testid="clear-active"
        onClick={() => {
          persistence.actions.clearActiveSessionStorage();
        }}
      >
        clear-active
      </button>
    </section>
  );
}

function createFailingStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem() {
      throw new Error("storage unavailable");
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem() {
      throw new Error("storage unavailable");
    },
    setItem() {
      throw new Error("storage unavailable");
    },
  };
}

describe("session persistence", () => {
  it("remembers last session and history in local storage", () => {
    const localStorageRef = new StorageDouble();
    const sessionStorageRef = new StorageDouble();
    render(
      <PersistenceProbe
        localStorageRef={localStorageRef}
        sessionStorageRef={sessionStorageRef}
      />,
    );

    fireEvent.click(screen.getByTestId("remember"));

    expect(screen.getByTestId("last-session-id").textContent).toBe("session-b");
    expect(localStorageRef.getItem(LAST_SESSION_STORAGE_KEY)).toBe("session-b");
    expect(localStorageRef.getItem(SESSION_HISTORY_STORAGE_KEY)).toContain(
      "session-b",
    );
  });

  it("reports storage access failures with structured metadata", () => {
    const onStorageFailure = vi.fn();
    render(
      <PersistenceProbe
        localStorageRef={createFailingStorage()}
        sessionStorageRef={createFailingStorage()}
        onStorageFailure={onStorageFailure}
      />,
    );

    fireEvent.click(screen.getByTestId("persist-active"));
    fireEvent.click(screen.getByTestId("clear-active"));

    expect(onStorageFailure).toHaveBeenCalled();
    expect(onStorageFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "write",
        key: ACTIVE_SESSION_STORAGE_KEY,
      }),
    );
    expect(onStorageFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "remove",
        key: ACTIVE_SESSION_STORAGE_KEY,
      }),
    );
  });

  it("reports partially invalid stored history entries as schema mismatches", () => {
    const localStorageRef = new StorageDouble();
    const sessionStorageRef = new StorageDouble();
    const onStorageFailure = vi.fn();
    localStorageRef.setItem(
      SESSION_HISTORY_STORAGE_KEY,
      JSON.stringify(["session-a", "", 42, null]),
    );

    render(
      <PersistenceProbe
        localStorageRef={localStorageRef}
        sessionStorageRef={sessionStorageRef}
        onStorageFailure={onStorageFailure}
      />,
    );

    expect(screen.getByTestId("history").textContent).toBe("session-a");
    expect(onStorageFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "parse",
        key: SESSION_HISTORY_STORAGE_KEY,
        reason: "schema_mismatch",
      }),
    );
  });
});
