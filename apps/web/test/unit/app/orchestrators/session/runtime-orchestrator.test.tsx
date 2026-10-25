import { act, render, screen, waitFor } from "@testing-library/react";
import { createRef, type Ref, useImperativeHandle } from "react";
import { describe, expect, it, vi } from "vitest";
import { useRuntimeOrchestrator } from "../../../../../src/features/terminal/app/engine/runtime/runtime-orchestrator";
import { loadXtermRuntime } from "../../../../../src/features/terminal/runtime/xterm-runtime";
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
  const { terminalElementRef, terminalReady } = useRuntimeOrchestrator({
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
      <div ref={terminalElementRef} />
      <output data-testid="ready">{String(terminalReady)}</output>
    </section>
  );
}

type RuntimeControl = Pick<
  ReturnType<typeof useRuntimeOrchestrator>,
  "terminalReady" | "writeOutput" | "resetTerminal" | "readTranscript"
>;

function RealRuntimeProbe({ ref }: { readonly ref: Ref<RuntimeControl> }) {
  const {
    terminalElementRef,
    terminalReady,
    writeOutput,
    resetTerminal,
    readTranscript,
  } = useRuntimeOrchestrator({
    documentRef: document,
    loadRuntime: loadXtermRuntime,
    initialFontSize: 11,
    onInput: () => undefined,
    onBootError: () => undefined,
  });
  useImperativeHandle(
    ref,
    () => ({ terminalReady, writeOutput, resetTerminal, readTranscript }),
    [terminalReady, writeOutput, resetTerminal, readTranscript],
  );
  return <div ref={terminalElementRef} />;
}

describe("runtime orchestrator", () => {
  it("resets real xterm output in order before a replay is parsed", async () => {
    const probe = createRef<RuntimeControl>();
    render(<RealRuntimeProbe ref={probe} />);
    await waitFor(() => expect(probe.current?.terminalReady).toBe(true));
    const runtime = probe.current;
    if (!runtime) throw new Error("terminal did not mount");

    act(() => {
      runtime.writeOutput("old session\r\n\x1b[?1049halt screen");
      runtime.resetTerminal();
      runtime.writeOutput("replayed output\r\n");
    });

    await waitFor(() =>
      expect(runtime.readTranscript()).toBe("replayed output"),
    );
  });

  it("disposes a partially mounted terminal when fitting fails", async () => {
    FakeTerminal.disposeCalls = 0;
    class FailingFitAddon extends FakeFitAddon {
      override fit(): void {
        throw new Error("fit failed");
      }
    }
    const onBootError = vi.fn();
    const rendered = render(
      <RuntimeProbe
        loadRuntime={async () => ({
          Terminal: FakeTerminal,
          FitAddon: FailingFitAddon,
          WebLinksAddon: FakeWebLinksAddon,
        })}
        onBootError={onBootError}
      />,
    );

    await waitFor(() => expect(onBootError).toHaveBeenCalled());

    expect(FakeTerminal.disposeCalls).toBe(1);
    expect(screen.getByTestId("ready").textContent).toBe("false");
    rendered.unmount();
    expect(FakeTerminal.disposeCalls).toBe(1);
  });

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
