import { once } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

import type { RuntimeConfig } from "../src/config";
import { buildServer } from "../src/server";
import type {
  TerminalCreateOptions,
  TerminalFactory,
  TerminalProcess,
} from "../src/terminal-process";

class FakeTerminalProcess implements TerminalProcess {
  writes: string[] = [];

  resizeCalls: Array<{ cols: number; rows: number }> = [];

  killed = false;

  private dataHandlers = new Set<(data: string) => void>();

  private exitHandlers = new Set<
    (exit: { code: number; signal: number }) => void
  >();

  write(data: string): void {
    this.writes.push(data);
  }

  resize(cols: number, rows: number): void {
    this.resizeCalls.push({ cols, rows });
  }

  kill(): void {
    this.killed = true;
  }

  onData(handler: (data: string) => void): () => void {
    this.dataHandlers.add(handler);
    return () => {
      this.dataHandlers.delete(handler);
    };
  }

  onExit(
    handler: (exit: { code: number; signal: number }) => void,
  ): () => void {
    this.exitHandlers.add(handler);
    return () => {
      this.exitHandlers.delete(handler);
    };
  }

  emitData(data: string): void {
    for (const handler of this.dataHandlers) {
      handler(data);
    }
  }

  emitExit(code = 0, signal = 0): void {
    for (const handler of this.exitHandlers) {
      handler({ code, signal });
    }
  }
}

class FakeTerminalFactory implements TerminalFactory {
  readonly created: FakeTerminalProcess[] = [];

  create(_options: TerminalCreateOptions): TerminalProcess {
    const proc = new FakeTerminalProcess();
    this.created.push(proc);
    return proc;
  }
}

class FailingTerminalFactory implements TerminalFactory {
  create(_options: TerminalCreateOptions): TerminalProcess {
    throw new Error("spawn failed in test");
  }
}

function makeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    reconnectGraceMs: 1_000,
    historyBytes: 1024 * 1024,
    command: "bash",
    args: [],
    cwd: process.cwd(),
    env: process.env,
    ...overrides,
  };
}

async function openSocket(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await once(ws, "open");
  return ws;
}

async function readMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  const [payload] = await once(ws, "message");
  return JSON.parse(payload.toString()) as Record<string, unknown>;
}

describe("terminal websocket", () => {
  let factory: FakeTerminalFactory;

  beforeEach(() => {
    factory = new FakeTerminalFactory();
  });

  it("attaches, forwards input, and handles resize", async () => {
    const app = await buildServer({
      config: makeConfig(),
      terminalFactory: factory,
      staticDir: "/tmp/does-not-exist",
    });

    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to get server address");
    }

    const ws = await openSocket(`ws://127.0.0.1:${address.port}/api/terminal`);
    ws.send(JSON.stringify({ type: "attach", cols: 120, rows: 40 }));

    const ready = await readMessage(ws);
    expect(ready.type).toBe("ready");

    ws.send(JSON.stringify({ type: "input", data: "echo hi\n" }));
    ws.send(JSON.stringify({ type: "resize", cols: 130, rows: 50 }));

    const proc = factory.created[0];
    await vi.waitFor(() => {
      expect(proc.writes).toContain("echo hi\n");
      expect(proc.resizeCalls).toContainEqual({ cols: 130, rows: 50 });
    });

    proc.emitData("hello\n");
    const output = await readMessage(ws);
    expect(output).toEqual({ type: "output", data: "hello\n" });

    ws.close();
    await once(ws, "close");
    await app.close();
  });

  it("kills abandoned sessions after reconnect grace period", async () => {
    const app = await buildServer({
      config: makeConfig({ reconnectGraceMs: 20 }),
      terminalFactory: factory,
      staticDir: "/tmp/does-not-exist",
    });

    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to get server address");
    }

    const ws = await openSocket(`ws://127.0.0.1:${address.port}/api/terminal`);
    ws.send(JSON.stringify({ type: "attach", cols: 80, rows: 24 }));
    await readMessage(ws);

    ws.close();
    await once(ws, "close");

    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });

    expect(factory.created[0].killed).toBe(true);

    await app.close();
  });

  it("returns attach error without crashing when terminal factory fails", async () => {
    const app = await buildServer({
      config: makeConfig(),
      terminalFactory: new FailingTerminalFactory(),
      staticDir: "/tmp/does-not-exist",
    });

    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to get server address");
    }

    const ws = await openSocket(`ws://127.0.0.1:${address.port}/api/terminal`);
    ws.send(JSON.stringify({ type: "attach", cols: 80, rows: 24 }));

    const errorMessage = await readMessage(ws);
    expect(errorMessage.type).toBe("error");
    expect(String(errorMessage.message)).toContain("Terminal attach failed");

    ws.close();
    await once(ws, "close");
    await app.close();
  });
});
