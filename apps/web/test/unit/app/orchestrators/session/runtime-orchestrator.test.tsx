import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRuntimeOrchestrator } from "../../../../../src/features/terminal/app/engine/runtime/runtime-orchestrator";
import type {
  TerminalRuntimeAddon,
  TerminalRuntimeMountElement,
} from "../../../../../src/features/terminal/runtime/xterm-runtime-contract";

class FakeFitAddon {
  fit(): void {
    // no-op
  }
}

class FakeWebLinksAddon {}

class FakeTerminal {
  static disposeCalls = 0;
  static inputDisposeCalls = 0;

  cols = 80;
  rows = 24;
  options: { fontSize?: number } = {};

  loadAddon(_addon: TerminalRuntimeAddon): void {
    // no-op
  }

  open(_element: TerminalRuntimeMountElement): void {
    // no-op
  }

  write(_data: string): void {
    // no-op
  }

  writeln(_data: string): void {
    // no-op
  }

  clear(): void {
    // no-op
  }

  dispose(): void {
    FakeTerminal.disposeCalls += 1;
  }

  onData(handler: (data: string) => void): { dispose: () => void } {
    handler("");
    return {
      dispose: () => {
        FakeTerminal.inputDisposeCalls += 1;
      },
    };
  }
}

type RuntimeProbeProps = {
  loadRuntime: () => Promise<{
    Terminal: typeof FakeTerminal;
    FitAddon: typeof FakeFitAddon;
    WebLinksAddon: typeof FakeWebLinksAddon;
  }>;
  onBootError?: (details: { reason: string; cause?: unknown }) => void;
};

function RuntimeProbe({ loadRuntime, onBootError }: RuntimeProbeProps) {
  const runtime = useRuntimeOrchestrator({
    documentRef: document,
    loadRuntime,
    initialFontSize: 11,
    onInput: () => {
      // no-op
    },
    onBootError: (details) => {
      onBootError?.(details);
    },
  });

  return (
    <section>
      <div ref={runtime.terminalElementRef} />
      <output data-testid="ready">{String(runtime.terminalReady)}</output>
    </section>
  );
}

describe("runtime orchestrator", () => {
  it("boots runtime terminal lifecycle", async () => {
    render(
      <RuntimeProbe
        loadRuntime={async () => ({
          Terminal: FakeTerminal,
          FitAddon: FakeFitAddon,
          WebLinksAddon: FakeWebLinksAddon,
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("true");
    });
  });

  it("publishes boot failure reason when runtime loading fails", async () => {
    const onBootError = vi.fn();
    render(
      <RuntimeProbe
        loadRuntime={async () => {
          throw new Error("loader exploded");
        }}
        onBootError={onBootError}
      />,
    );

    await waitFor(() => {
      expect(onBootError).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "loader exploded",
        }),
      );
      expect(screen.getByTestId("ready").textContent).toBe("false");
    });
  });

  it("disposes terminal and input subscriptions on unmount", async () => {
    FakeTerminal.disposeCalls = 0;
    FakeTerminal.inputDisposeCalls = 0;

    const rendered = render(
      <RuntimeProbe
        loadRuntime={async () => ({
          Terminal: FakeTerminal,
          FitAddon: FakeFitAddon,
          WebLinksAddon: FakeWebLinksAddon,
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("true");
    });

    rendered.unmount();

    expect(FakeTerminal.disposeCalls).toBeGreaterThanOrEqual(1);
    expect(FakeTerminal.inputDisposeCalls).toBeGreaterThanOrEqual(1);
  });
});
