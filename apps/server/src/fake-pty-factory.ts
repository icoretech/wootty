import type {
  TerminalCreateOptions,
  TerminalExit,
  TerminalFactory,
  TerminalProcess,
} from "./terminal-process";

class FakeTerminalProcess implements TerminalProcess {
  private readonly dataHandlers = new Set<(data: string) => void>();
  private readonly exitHandlers = new Set<(exit: TerminalExit) => void>();

  private exited = false;
  private lineBuffer = "";

  constructor(options: TerminalCreateOptions) {
    queueMicrotask(() => {
      this.emitData(
        `WooTTY fake terminal ready (${options.command} ${options.args.join(" ")})\r\n$ `,
      );
    });
  }

  write(data: string): void {
    if (this.exited) {
      return;
    }

    for (const chunk of data) {
      if (chunk === "\r" || chunk === "\n") {
        this.emitData("\r\n");

        const trimmed = this.lineBuffer.trim();
        this.lineBuffer = "";

        if (trimmed === "exit") {
          this.emitExit({ code: 0, signal: 0 });
          return;
        }

        this.emitData("$ ");
        continue;
      }

      this.lineBuffer += chunk;
      this.emitData(chunk);
    }
  }

  resize(_cols: number, _rows: number): void {
    // intentionally no-op in fake mode
  }

  kill(): void {
    if (this.exited) {
      return;
    }

    this.emitExit({ code: 0, signal: 15 });
  }

  onData(handler: (data: string) => void): () => void {
    this.dataHandlers.add(handler);
    return () => {
      this.dataHandlers.delete(handler);
    };
  }

  onExit(handler: (exit: TerminalExit) => void): () => void {
    this.exitHandlers.add(handler);
    return () => {
      this.exitHandlers.delete(handler);
    };
  }

  private emitData(data: string): void {
    for (const handler of this.dataHandlers) {
      handler(data);
    }
  }

  private emitExit(exitInfo: TerminalExit): void {
    this.exited = true;
    for (const handler of this.exitHandlers) {
      handler(exitInfo);
    }
  }
}

export class FakeTerminalFactory implements TerminalFactory {
  create(options: TerminalCreateOptions): TerminalProcess {
    return new FakeTerminalProcess(options);
  }
}
