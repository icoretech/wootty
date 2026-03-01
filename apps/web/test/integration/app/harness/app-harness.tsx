import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { vi } from "vitest";
import App from "../../../../src/App";
import { TerminalApp } from "../../../../src/features/terminal/app/TerminalApp";
import { TERMINAL_WIRE_CONTRACT_VERSION } from "../../../../src/features/terminal/protocol/terminal-wire-schema";
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

async function waitForSocketReady(
  socketHarness: WebSocketMockHarness,
  index = 0,
): Promise<WebSocketMock> {
  await waitFor(() => {
    if (!socketHarness.instances[index]) {
      throw new Error(`socket ${index} not ready`);
    }
  });
  return socketHarness.instances[index] as WebSocketMock;
}

class AppHarnessContext implements AppHarness {
  readonly runtime = createRuntimeMock();
  readonly socket = createWebSocketMockHarness();
  readonly localStorageRef = new StorageDouble();
  readonly sessionStorageRef = new StorageDouble();
  private readonly fetchHarness = createFetchHarness();
  readonly fetchMock = this.fetchHarness.fetchMock;

  constructor() {
    vi.stubGlobal("localStorage", this.localStorageRef);
    vi.stubGlobal("sessionStorage", this.sessionStorageRef);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: this.localStorageRef,
    });
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: this.sessionStorageRef,
    });
  }

  private renderEntry(entry: AppEntry): void {
    const environment = createTerminalEnvironment(this.socket, this.runtime);
    if (entry === "terminal") {
      render(<TerminalApp environment={environment} />);
      return;
    }
    render(<App environment={environment} />);
  }

  cleanup(): void {
    this.runtime.reset();
    this.socket.reset();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  }

  renderTerminalApp(entry: AppEntry = "app"): void {
    this.renderEntry(entry);
  }

  async waitForSocket(index = 0): Promise<WebSocketMock> {
    return waitForSocketReady(this.socket, index);
  }

  async openSocket(ws: WebSocketMock): Promise<void> {
    await act(async () => {
      ws.triggerOpen();
    });
  }

  async markReady(
    ws: WebSocketMock,
    sessionId: string,
    readOnly = false,
  ): Promise<void> {
    await act(async () => {
      ws.triggerMessage({
        type: "ready",
        version: TERMINAL_WIRE_CONTRACT_VERSION,
        sessionId,
        readOnly,
      });
    });
  }

  async bootConnected(
    sessionId = "session-a",
    entry: AppEntry = "app",
  ): Promise<WebSocketMock> {
    this.renderEntry(entry);
    const ws = await waitForSocketReady(this.socket, 0);
    await act(async () => {
      ws.triggerOpen();
      ws.triggerMessage({
        type: "ready",
        version: TERMINAL_WIRE_CONTRACT_VERSION,
        sessionId,
        readOnly: false,
      });
    });
    return ws;
  }

  async openSessionMenu(): Promise<void> {
    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-button"));
    });
  }

  seedLastSession(sessionId: string): void {
    this.localStorageRef.setItem(LAST_SESSION_STORAGE_KEY, sessionId);
  }

  seedSessionHistory(sessionIds: string[]): void {
    this.localStorageRef.setItem(
      SESSION_HISTORY_STORAGE_KEY,
      JSON.stringify(sessionIds),
    );
  }

  setFetchResponse(init: SessionsResponseInit): void {
    this.fetchHarness.setFetchResponse(init);
  }

  setFetchError(error: Error): void {
    this.fetchHarness.setFetchError(error);
  }
}

export function setupAppTestEnvironment(): AppHarness {
  vi.clearAllMocks();
  return new AppHarnessContext();
}
