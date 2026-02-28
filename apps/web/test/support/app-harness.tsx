import { vi } from "vitest";

import { getRuntimeMock } from "./runtime-mock";
import { MockWebSocket, sentMessages } from "./socket-mock";

const runtime = getRuntimeMock();

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
  } as Storage;
}

export function setupAppTestEnvironment(): ReturnType<typeof vi.fn> {
  runtime.FakeTerminal.instances.length = 0;
  MockWebSocket.instances.length = 0;

  const localStorageRef = createStorage();
  const sessionStorageRef = createStorage();
  vi.stubGlobal("localStorage", localStorageRef);
  vi.stubGlobal("sessionStorage", sessionStorageRef);
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageRef,
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: sessionStorageRef,
  });

  vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ sessions: [] }),
  }));
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

export { MockWebSocket, runtime, sentMessages };
