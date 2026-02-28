import type { TerminalRuntime } from "../../../../src/features/terminal/runtime/xterm-runtime";
import type { TerminalRuntimeBoundary } from "../../../support/harness/terminal-boundary";

type RuntimeTerminalOptions = {
  fontSize?: number;
};

type RuntimeModule = {
  Terminal: new (options?: RuntimeTerminalOptions) => FakeTerminal;
  FitAddon: new () => FakeFitAddon;
  WebLinksAddon: new () => FakeWebLinksAddon;
} & TerminalRuntime;

class FakeFitAddon {
  fitCalls = 0;

  fit(): void {
    this.fitCalls += 1;
  }
}

class FakeWebLinksAddon {}

class FakeTerminal {
  cols = 80;
  rows = 24;
  options: { fontSize: number };
  clearCalls = 0;

  private readonly dataHandlers = new Set<(data: string) => void>();

  constructor(options: RuntimeTerminalOptions = {}) {
    this.options = { fontSize: options.fontSize ?? 11 };
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

export type RuntimeMock = {
  readonly terminals: FakeTerminal[];
  loadRuntime: () => Promise<RuntimeModule>;
  reset: () => void;
} & TerminalRuntimeBoundary;

export function createRuntimeMock(): RuntimeMock {
  const terminals: FakeTerminal[] = [];

  class RuntimeTerminal extends FakeTerminal {
    constructor(options: RuntimeTerminalOptions = {}) {
      super(options);
      terminals.push(this);
    }
  }

  const runtimeModule: RuntimeModule = {
    Terminal: RuntimeTerminal,
    FitAddon: FakeFitAddon,
    WebLinksAddon: FakeWebLinksAddon,
  };

  return {
    terminals,
    loadRuntime: async () => runtimeModule,
    reset: () => {
      terminals.length = 0;
    },
  };
}
