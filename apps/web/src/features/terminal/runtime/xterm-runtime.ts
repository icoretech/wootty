import type { FitAddon } from "@xterm/addon-fit";
import type { WebLinksAddon } from "@xterm/addon-web-links";
import type { Terminal } from "@xterm/xterm";

export interface TerminalRuntimeDisposable {
  dispose(): void;
}

export interface TerminalRuntimeTerminal {
  cols: number;
  rows: number;
  options: { fontSize?: number };
  loadAddon(addon: unknown): void;
  open(element: unknown): void;
  write(data: string): void;
  writeln(data: string): void;
  clear(): void;
  dispose(): void;
  onData(handler: (data: string) => void): TerminalRuntimeDisposable;
}

export interface TerminalRuntimeFitAddon {
  fit(): void;
}

export interface TerminalRuntime {
  Terminal: new (options?: Record<string, unknown>) => TerminalRuntimeTerminal;
  FitAddon: new () => TerminalRuntimeFitAddon;
  WebLinksAddon: new () => unknown;
}

interface XtermRuntime extends TerminalRuntime {
  Terminal: typeof Terminal;
  FitAddon: typeof FitAddon;
  WebLinksAddon: typeof WebLinksAddon;
}

type XtermRuntimeLoader = () => Promise<XtermRuntime>;

type XtermRuntimeProvider = {
  load: () => Promise<XtermRuntime>;
  reset: () => void;
};

async function importXtermRuntime(): Promise<XtermRuntime> {
  const [xterm, fitAddon, webLinksAddon] = await Promise.all([
    import("@xterm/xterm"),
    import("@xterm/addon-fit"),
    import("@xterm/addon-web-links"),
    import("@xterm/xterm/css/xterm.css"),
  ]);

  return {
    Terminal: xterm.Terminal,
    FitAddon: fitAddon.FitAddon,
    WebLinksAddon: webLinksAddon.WebLinksAddon,
  };
}

export function createXtermRuntimeProvider(
  loader: XtermRuntimeLoader = importXtermRuntime,
): XtermRuntimeProvider {
  let runtimePromise: Promise<XtermRuntime> | null = null;

  return {
    load: () => {
      if (!runtimePromise) {
        runtimePromise = loader();
      }
      return runtimePromise;
    },
    reset: () => {
      runtimePromise = null;
    },
  };
}

export function loadXtermRuntime(): Promise<XtermRuntime> {
  return importXtermRuntime();
}
