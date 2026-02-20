import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACTIVE_SESSION_STORAGE_KEY,
  LAST_SESSION_STORAGE_KEY,
} from "../src/lib/terminal-session";

const runtime = vi.hoisted(() => {
  class FakeFitAddon {
    fitCalls = 0;

    fit(): void {
      this.fitCalls += 1;
    }
  }

  class FakeWebLinksAddon {}

  class FakeTerminal {
    static instances: FakeTerminal[] = [];

    cols = 80;
    rows = 24;
    options: { fontSize: number };
    clearCalls = 0;

    private dataHandlers = new Set<(data: string) => void>();

    constructor(options: unknown) {
      const typedOptions = (options ?? {}) as { fontSize?: number };
      this.options = { fontSize: typedOptions.fontSize ?? 11 };
      FakeTerminal.instances.push(this);
    }

    loadAddon(_addon: unknown): void {
      // no-op for tests
    }

    open(_element: unknown): void {
      // no-op for tests
    }

    write(_data: string): void {
      // no-op for tests
    }

    writeln(_data: string): void {
      // no-op for tests
    }

    clear(): void {
      this.clearCalls += 1;
    }

    dispose(): void {
      // no-op for tests
    }

    onData(handler: (data: string) => void): { dispose: () => void } {
      this.dataHandlers.add(handler);
      return {
        dispose: () => {
          this.dataHandlers.delete(handler);
        },
      };
    }

    emitInput(data: string): void {
      for (const handler of this.dataHandlers) {
        handler(data);
      }
    }
  }

  return {
    FakeFitAddon,
    FakeWebLinksAddon,
    FakeTerminal,
  };
});

vi.mock("../src/lib/xterm-runtime", () => {
  return {
    loadXtermRuntime: async () => ({
      Terminal: runtime.FakeTerminal,
      FitAddon: runtime.FakeFitAddon,
      WebLinksAddon: runtime.FakeWebLinksAddon,
    }),
  };
});

import App from "../src/App";

let fetchMock: ReturnType<typeof vi.fn>;

type MessageListener = (event: { data?: string }) => void;
type Listener = (event?: unknown) => void;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  readonly sent: string[] = [];

  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(_code?: number, _reason?: string): void {
    if (this.readyState >= MockWebSocket.CLOSING) {
      return;
    }

    this.readyState = MockWebSocket.CLOSING;
    this.emit("close", {});
    this.readyState = MockWebSocket.CLOSED;
  }

  triggerOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open", {});
  }

  triggerMessage(payload: object): void {
    const event = { data: JSON.stringify(payload) };
    const listeners = this.listeners.get("message") as
      | Set<MessageListener>
      | undefined;
    listeners?.forEach((listener) => {
      listener(event);
    });
  }

  private emit(type: string, event: unknown): void {
    this.listeners.get(type)?.forEach((listener) => {
      listener(event);
    });
  }
}

function sentMessages(ws: MockWebSocket): Array<Record<string, unknown>> {
  return ws.sent.map((entry) => JSON.parse(entry) as Record<string, unknown>);
}

describe("App integration", () => {
  beforeEach(() => {
    runtime.FakeTerminal.instances.length = 0;
    MockWebSocket.instances.length = 0;

    const localValues = new Map<string, string>();
    const sessionValues = new Map<string, string>();
    const localStorageRef = {
      getItem(key: string): string | null {
        return localValues.get(key) ?? null;
      },
      setItem(key: string, value: string): void {
        localValues.set(key, value);
      },
      removeItem(key: string): void {
        localValues.delete(key);
      },
      clear(): void {
        localValues.clear();
      },
      key(index: number): string | null {
        return [...localValues.keys()][index] ?? null;
      },
      get length(): number {
        return localValues.size;
      },
    } as Storage;
    const sessionStorageRef = {
      getItem(key: string): string | null {
        return sessionValues.get(key) ?? null;
      },
      setItem(key: string, value: string): void {
        sessionValues.set(key, value);
      },
      removeItem(key: string): void {
        sessionValues.delete(key);
      },
      clear(): void {
        sessionValues.clear();
      },
      key(index: number): string | null {
        return [...sessionValues.keys()][index] ?? null;
      },
      get length(): number {
        return sessionValues.size;
      },
    } as Storage;

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
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sessions: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("connects and stores ready session id in tab and resume storage", async () => {
    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws1 = MockWebSocket.instances[0];

    await act(async () => {
      ws1.triggerOpen();
    });

    await waitFor(() => {
      const attach = sentMessages(ws1).find(
        (message) => message.type === "attach",
      );
      expect(attach).toBeDefined();
      expect(attach?.cols).toBe(80);
      expect(attach?.rows).toBe(24);
    });

    await act(async () => {
      ws1.triggerMessage({ type: "ready", sessionId: "session-a" });
    });

    expect(screen.getByTestId("status-label").textContent).toContain(
      "Connected",
    );
    expect(screen.getByTestId("session-value").textContent).toContain(
      "session-a",
    );
    expect(localStorage.getItem(LAST_SESSION_STORAGE_KEY)).toBe("session-a");
    expect(sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)).toBe(
      "session-a",
    );
  });

  it("buffers input while disconnected and flushes after reconnect", async () => {
    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws1 = MockWebSocket.instances[0];

    await act(async () => {
      ws1.triggerOpen();
      ws1.triggerMessage({ type: "ready", sessionId: "session-a" });
    });

    const terminal = runtime.FakeTerminal.instances[0];

    await act(async () => {
      ws1.close();
      terminal.emitInput("ls\n");
    });

    await waitFor(
      () => {
        expect(MockWebSocket.instances.length).toBe(2);
      },
      { timeout: 1_500 },
    );

    const ws2 = MockWebSocket.instances[1];

    await act(async () => {
      ws2.triggerOpen();
      ws2.triggerMessage({ type: "ready", sessionId: "session-a" });
    });

    await waitFor(() => {
      const inputFrame = sentMessages(ws2).find(
        (message) => message.type === "input" && message.data === "ls\n",
      );
      expect(inputFrame).toBeDefined();
    });

    expect(screen.getByTestId("status-label").textContent).toContain(
      "Connected",
    );
  });

  it("starts a fresh session without reusing active tab session id", async () => {
    sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, "session-old");
    localStorage.setItem(LAST_SESSION_STORAGE_KEY, "session-old");

    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws1 = MockWebSocket.instances[0];

    await act(async () => {
      ws1.triggerOpen();
      ws1.triggerMessage({ type: "ready", sessionId: "session-old" });
      ws1.triggerMessage({ type: "output", data: "hello\n" });
    });

    expect(screen.getByTestId("output-value").getAttribute("data-bytes")).toBe(
      "6",
    );
    const terminal = runtime.FakeTerminal.instances[0];
    expect(terminal.clearCalls).toBe(0);

    const attachFirst = sentMessages(ws1).find(
      (message) => message.type === "attach",
    );
    expect(attachFirst?.sessionId).toBe("session-old");

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-button"));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-new"));
    });

    expect(screen.getByTestId("output-value").getAttribute("data-bytes")).toBe(
      "0",
    );
    expect(terminal.clearCalls).toBe(1);

    await waitFor(
      () => {
        expect(MockWebSocket.instances.length).toBe(2);
      },
      { timeout: 1_500 },
    );

    const ws2 = MockWebSocket.instances[1];

    await act(async () => {
      ws2.triggerOpen();
    });

    await waitFor(() => {
      const attachSecond = sentMessages(ws2).find(
        (message) => message.type === "attach",
      );
      expect(attachSecond).toBeDefined();
      expect(attachSecond).not.toHaveProperty("sessionId");
    });

    await act(async () => {
      ws2.triggerMessage({ type: "ready", sessionId: "session-new" });
    });

    expect(screen.getByTestId("session-value").textContent).toContain(
      "session-new",
    );
    expect(localStorage.getItem(LAST_SESSION_STORAGE_KEY)).toBe("session-new");
    expect(sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)).toBe(
      "session-new",
    );
  });

  it("resumes previous session only via explicit resume action", async () => {
    localStorage.setItem(LAST_SESSION_STORAGE_KEY, "session-old");

    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws1 = MockWebSocket.instances[0];
    await act(async () => {
      ws1.triggerOpen();
    });

    await waitFor(() => {
      const attachFirst = sentMessages(ws1).find(
        (message) => message.type === "attach",
      );
      expect(attachFirst).toBeDefined();
      expect(attachFirst).not.toHaveProperty("sessionId");
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-button"));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-resume-last"));
    });

    const terminal = runtime.FakeTerminal.instances[0];
    expect(terminal.clearCalls).toBe(1);

    await waitFor(
      () => {
        expect(MockWebSocket.instances.length).toBe(2);
      },
      { timeout: 1_500 },
    );

    const ws2 = MockWebSocket.instances[1];
    await act(async () => {
      ws2.triggerOpen();
    });

    await waitFor(() => {
      const attachSecond = sentMessages(ws2).find(
        (message) => message.type === "attach",
      );
      expect(attachSecond).toBeDefined();
      expect(attachSecond?.sessionId).toBe("session-old");
    });
  });

  it("updates font size controls and persists preference", async () => {
    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws = MockWebSocket.instances[0];
    await act(async () => {
      ws.triggerOpen();
      ws.triggerMessage({ type: "ready", sessionId: "session-a" });
    });

    expect(localStorage.getItem("wootty.fontSize")).toBeNull();
    expect(runtime.FakeTerminal.instances[0].options.fontSize).toBe(11);

    await act(async () => {
      fireEvent.click(screen.getByTestId("font-increase-button"));
    });

    expect(localStorage.getItem("wootty.fontSize")).toBe("12");
    expect(runtime.FakeTerminal.instances[0].options.fontSize).toBe(12);

    await act(async () => {
      fireEvent.click(screen.getByTestId("font-reset-button"));
    });

    expect(localStorage.getItem("wootty.fontSize")).toBe("11");
    expect(runtime.FakeTerminal.instances[0].options.fontSize).toBe(11);
  });

  it("announces reconnect status changes for assistive tech", async () => {
    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws = MockWebSocket.instances[0];
    await act(async () => {
      ws.triggerOpen();
      ws.triggerMessage({ type: "ready", sessionId: "session-a" });
    });

    expect(screen.getByTestId("status-announcement").textContent).toContain(
      "Connection status Connected.",
    );

    await act(async () => {
      ws.close();
    });

    await waitFor(() => {
      expect(screen.getByTestId("status-announcement").textContent).toContain(
        "Reconnecting. Attempt 1.",
      );
    });
  });

  it("attaches in watch mode for sessions already controlled elsewhere", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        sessions: [
          {
            id: "session-watch",
            hasController: true,
            watchers: 0,
            createdAtMs: Date.now() - 10_000,
            lastActivityMs: Date.now() - 3_000,
            command: "sh",
          },
        ],
      }),
    });

    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws1 = MockWebSocket.instances[0];
    await act(async () => {
      ws1.triggerOpen();
      ws1.triggerMessage({ type: "ready", sessionId: "session-own" });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-button"));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-menu-watch-item"));
    });

    await waitFor(
      () => {
        expect(MockWebSocket.instances.length).toBe(2);
      },
      { timeout: 1_500 },
    );

    const ws2 = MockWebSocket.instances[1];
    await act(async () => {
      ws2.triggerOpen();
    });

    await waitFor(() => {
      const attachSecond = sentMessages(ws2).find(
        (message) => message.type === "attach",
      );
      expect(attachSecond).toBeDefined();
      expect(attachSecond?.sessionId).toBe("session-watch");
      expect(attachSecond?.watch).toBe(true);
    });

    await act(async () => {
      ws2.triggerMessage({
        type: "ready",
        sessionId: "session-watch",
        readOnly: true,
      });
    });

    expect(screen.getByText("Read-only").textContent).toBe("Read-only");
  });
});
