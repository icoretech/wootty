import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TerminalPlatformContext } from "../../../src/features/terminal/app/composition/terminal-platform-composition";
import { useTerminalSessionDomain } from "../../../src/features/terminal/app/composition/terminal-session-domain";
import type { TerminalDomainEnvironment } from "../../../src/features/terminal/environment/terminal-environment-contract";
import { browserScheduler } from "../../../src/features/terminal/platform/scheduler";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("terminal session domain", () => {
  it("publishes bootstrap failures through session notice and keeps ws disabled", async () => {
    const storage = createStorage();
    const environment: TerminalDomainEnvironment = {
      createTransport: vi.fn(() => {
        throw new Error("transport not expected");
      }),
      loadRuntime: async () => {
        throw new Error("runtime not expected");
      },
      getLocalStorage: () => ({ storage, error: null }),
      getSessionStorage: () => ({ storage, error: null }),
    };
    const platform: TerminalPlatformContext = {
      windowRef: window,
      documentRef: document,
      scheduler: browserScheduler,
      backendResolution: {
        ok: false,
        issue: {
          code: "socket_url_invalid_format",
          details: "invalid endpoint",
        },
      },
      fetchSessions: vi.fn(async () => ({ ok: true, payload: {} })),
    };

    const { result } = renderHook(() =>
      useTerminalSessionDomain({
        environment,
        platform,
      }),
    );

    expect(result.current.wsUrl).toBeNull();
    expect(result.current.uiState.initialFontSize).toBe(11);
    await waitFor(() => {
      expect(result.current.sessionState.sessionNotice).toContain(
        "bootstrap configuration error",
      );
    });
  });
});
