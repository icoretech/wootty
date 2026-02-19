import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import { SessionManager } from "../src/session-manager";
import type {
  TerminalCreateOptions,
  TerminalFactory,
  TerminalProcess,
} from "../src/terminal-process";

class FakeTerminalProcess implements TerminalProcess {
  private dataHandlers = new Set<(data: string) => void>();

  private exitHandlers = new Set<
    (exit: { code: number; signal: number }) => void
  >();

  killed = false;

  write(_data: string): void {
    // no-op for this test
  }

  resize(_cols: number, _rows: number): void {
    // no-op for this test
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
}

class FakeFactory implements TerminalFactory {
  created: FakeTerminalProcess[] = [];

  create(_options: TerminalCreateOptions): TerminalProcess {
    const proc = new FakeTerminalProcess();
    this.created.push(proc);
    return proc;
  }
}

class FakeSocket extends EventEmitter {
  readyState = 1;

  readonly sent: string[] = [];

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = 3;
    this.emit("close");
  }
}

describe("session manager", () => {
  it("replays buffered output on reconnect", () => {
    const factory = new FakeFactory();
    const manager = new SessionManager({
      reconnectGraceMs: 5_000,
      historyBytes: 1024 * 1024,
      terminalFactory: factory,
      createOptions: {
        command: "bash",
        args: [],
        cwd: process.cwd(),
        env: process.env,
      },
    });

    const socket1 = new FakeSocket();

    const attach1 = manager.attach(undefined, socket1 as never, 120, 40);
    const proc = factory.created[0];

    proc.emitData("hello\n");
    manager.detach(attach1.sessionId, socket1 as never);

    proc.emitData("while-disconnected\n");

    const socket2 = new FakeSocket();
    const attach2 = manager.attach(
      attach1.sessionId,
      socket2 as never,
      120,
      40,
    );

    expect(attach2.created).toBe(false);
    expect(attach2.history).toContain("hello");
    expect(attach2.history).toContain("while-disconnected");

    manager.shutdown();
  });
});
