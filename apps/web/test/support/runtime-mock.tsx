import { vi } from "vitest";

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

vi.mock("../../src/lib/xterm-runtime", () => {
  return {
    loadXtermRuntime: async () => ({
      Terminal: runtime.FakeTerminal,
      FitAddon: runtime.FakeFitAddon,
      WebLinksAddon: runtime.FakeWebLinksAddon,
    }),
  };
});

export function getRuntimeMock() {
  return runtime;
}
