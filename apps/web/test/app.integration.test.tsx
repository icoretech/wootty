import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_STORAGE_KEY } from "../src/lib/terminal-session";

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

    private dataHandlers = new Set<(data: string) => void>();

    constructor(options: unknown) {
      const typedOptions = (options ?? {}) as { fontSize?: number };
      this.options = { fontSize: typedOptions.fontSize ?? 14 };
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
      // no-op for tests
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

    const values = new Map<string, string>();
    const storage = {
      getItem(key: string): string | null {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string): void {
        values.set(key, value);
      },
      removeItem(key: string): void {
        values.delete(key);
      },
      clear(): void {
        values.clear();
      },
      key(index: number): string | null {
        return [...values.keys()][index] ?? null;
      },
      get length(): number {
        return values.size;
      },
    } as Storage;

    vi.stubGlobal("localStorage", storage);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    });
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  });

  it("connects and stores ready session id", async () => {
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
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe("session-a");
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

  it("starts a fresh session without reusing stored session id", async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, "session-old");

    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    const ws1 = MockWebSocket.instances[0];

    await act(async () => {
      ws1.triggerOpen();
      ws1.triggerMessage({ type: "ready", sessionId: "session-old" });
    });

    const attachFirst = sentMessages(ws1).find(
      (message) => message.type === "attach",
    );
    expect(attachFirst?.sessionId).toBe("session-old");

    await act(async () => {
      fireEvent.click(screen.getByTestId("new-session-button"));
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
      expect(attachSecond).not.toHaveProperty("sessionId");
    });

    await act(async () => {
      ws2.triggerMessage({ type: "ready", sessionId: "session-new" });
    });

    expect(screen.getByTestId("session-value").textContent).toContain(
      "session-new",
    );
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe("session-new");
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
    expect(runtime.FakeTerminal.instances[0].options.fontSize).toBe(14);

    await act(async () => {
      fireEvent.click(screen.getByTestId("font-increase-button"));
    });

    expect(localStorage.getItem("wootty.fontSize")).toBe("15");
    expect(runtime.FakeTerminal.instances[0].options.fontSize).toBe(15);

    await act(async () => {
      fireEvent.click(screen.getByTestId("font-reset-button"));
    });

    expect(localStorage.getItem("wootty.fontSize")).toBe("14");
    expect(runtime.FakeTerminal.instances[0].options.fontSize).toBe(14);
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
});
