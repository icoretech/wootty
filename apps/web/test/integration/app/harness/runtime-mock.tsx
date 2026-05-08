import type {
  TerminalRuntime,
  TerminalRuntimeAddon,
  TerminalRuntimeMountElement,
} from "../../../../src/features/terminal/runtime/xterm-runtime-contract";
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

class FakeBufferLine {
  constructor(
    private readonly value: string,
    readonly isWrapped: boolean,
  ) {}

  translateToString(): string {
    return this.value;
  }
}

class FakeTerminal {
  cols = 80;
  rows = 24;
  options: { fontSize: number };
  clearCalls = 0;
  viewportY = 0;
  readonly lines: Array<{ text: string; isWrapped: boolean }> = [
    { text: "", isWrapped: false },
  ];
  readonly buffer;

  private readonly dataHandlers = new Set<(data: string) => void>();

  constructor(options: RuntimeTerminalOptions = {}) {
    const terminal = this;
    this.options = { fontSize: options.fontSize ?? 11 };
    this.buffer = {
      active: {
        get viewportY() {
          return terminal.viewportY;
        },
        get length() {
          return terminal.lines.length;
        },
        getLine(y: number) {
          const line = terminal.lines[y];
          return line
            ? new FakeBufferLine(line.text, line.isWrapped)
            : undefined;
        },
      },
    };
  }

  loadAddon(_addon: TerminalRuntimeAddon): void {
    // no-op for tests
  }

  open(_element: TerminalRuntimeMountElement): void {
    // no-op for tests
  }

  write(data: string): void {
    this.appendOutput(data);
  }

  writeln(data: string): void {
    this.appendOutput(`${data}\n`);
  }

  clear(): void {
    this.clearCalls += 1;
    this.lines.length = 0;
    this.lines.push({ text: "", isWrapped: false });
    this.viewportY = 0;
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

  private appendOutput(data: string): void {
    const normalized = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const parts = normalized.split("\n");
    const currentLine = this.lines.at(-1);
    if (currentLine === undefined) {
      throw new Error(
        "Expected a current terminal line before appending output",
      );
    }
    currentLine.text += parts[0] ?? "";

    for (let index = 1; index < parts.length; index += 1) {
      this.lines.push({ text: parts[index] ?? "", isWrapped: false });
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
