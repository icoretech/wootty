import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { vi } from "vitest";
import App from "../../../../src/App";
import {
  TerminalApp,
  type TerminalAppEnvironment,
} from "../../../../src/features/terminal/app/TerminalApp";
import {
  LAST_SESSION_STORAGE_KEY,
  SESSION_HISTORY_STORAGE_KEY,
} from "../../../../src/features/terminal/session/persistence/storage-keys";
import {
  createWebSocketMockHarness,
  type WebSocketMock,
  type WebSocketMockHarness,
} from "../../../support/harness/socket-mock";
import { StorageDouble } from "../../../support/harness/storage-double";
import { createTerminalEnvironment } from "../../../support/harness/terminal-boundary";
import { createFetchHarness, type SessionsResponseInit } from "./fetch-harness";
import { createRuntimeMock, type RuntimeMock } from "./runtime-mock";

type AppEntry = "app" | "terminal";

type AppHarness = {
  readonly fetchMock: ReturnType<typeof vi.fn>;
  readonly localStorageRef: Storage;
  readonly sessionStorageRef: Storage;
  readonly runtime: RuntimeMock;
  readonly socket: WebSocketMockHarness;
  cleanup: () => void;
  renderTerminalApp: (entry?: AppEntry) => void;
  waitForSocket: (index?: number) => Promise<WebSocketMock>;
  openSocket: (ws: WebSocketMock) => Promise<void>;
  markReady: (
    ws: WebSocketMock,
    sessionId: string,
    readOnly?: boolean,
  ) => Promise<void>;
  bootConnected: (
    sessionId?: string,
    entry?: AppEntry,
  ) => Promise<WebSocketMock>;
  openSessionMenu: () => Promise<void>;
  seedLastSession: (sessionId: string) => void;
  seedSessionHistory: (sessionIds: string[]) => void;
  setFetchResponse: (init: SessionsResponseInit) => void;
  setFetchError: (error: Error) => void;
};

export function setupAppTestEnvironment(): AppHarness {
  vi.clearAllMocks();

  const runtime = createRuntimeMock();
  const socket = createWebSocketMockHarness();

  const localStorageRef = new StorageDouble();
  const sessionStorageRef = new StorageDouble();
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

  const fetchHarness = createFetchHarness();
  const renderEntry = (
    entry: AppEntry,
    environment: TerminalAppEnvironment,
  ) => {
    if (entry === "terminal") {
      render(<TerminalApp environment={environment} />);
      return;
    }

    render(<App environment={environment} />);
  };

  return {
    fetchMock: fetchHarness.fetchMock,
    localStorageRef,
    sessionStorageRef,
    runtime,
    socket,
    cleanup: () => {
      runtime.reset();
      socket.reset();
      vi.unstubAllGlobals();
      vi.clearAllMocks();
    },
    renderTerminalApp: (entry = "app") => {
      renderEntry(entry, createTerminalEnvironment(socket, runtime));
    },
    waitForSocket: async (index = 0) => {
      await waitFor(() => {
        if (!socket.instances[index]) {
          throw new Error(`socket ${index} not ready`);
        }
      });
      return socket.instances[index] as WebSocketMock;
    },
    openSocket: async (ws) => {
      await act(async () => {
        ws.triggerOpen();
      });
    },
    markReady: async (ws, sessionId, readOnly = false) => {
      await act(async () => {
        ws.triggerMessage({ type: "ready", sessionId, readOnly });
      });
    },
    bootConnected: async (sessionId = "session-a", entry = "app") => {
      renderEntry(entry, createTerminalEnvironment(socket, runtime));
      const ws = await (async () => {
        await waitFor(() => {
          if (!socket.instances[0]) {
            throw new Error("socket 0 not ready");
          }
        });
        return socket.instances[0] as WebSocketMock;
      })();
      await act(async () => {
        ws.triggerOpen();
        ws.triggerMessage({ type: "ready", sessionId });
      });
      return ws;
    },
    openSessionMenu: async () => {
      await act(async () => {
        fireEvent.click(screen.getByTestId("session-menu-button"));
      });
    },
    seedLastSession: (sessionId) => {
      localStorageRef.setItem(LAST_SESSION_STORAGE_KEY, sessionId);
    },
    seedSessionHistory: (sessionIds) => {
      localStorageRef.setItem(
        SESSION_HISTORY_STORAGE_KEY,
        JSON.stringify(sessionIds),
      );
    },
    setFetchResponse: fetchHarness.setFetchResponse,
    setFetchError: fetchHarness.setFetchError,
  };
}
