import type { FitAddon } from "@xterm/addon-fit";
import type { WebLinksAddon } from "@xterm/addon-web-links";
import type { Terminal } from "@xterm/xterm";
import type {
  TerminalRuntime,
  XtermRuntimeProvider,
} from "./xterm-runtime-contract";

interface XtermRuntime extends TerminalRuntime {
  Terminal: typeof Terminal;
  FitAddon: typeof FitAddon;
  WebLinksAddon: typeof WebLinksAddon;
}

type XtermRuntimeLoader = () => Promise<XtermRuntime>;

function loadWithResetOnFailure(
  loader: XtermRuntimeLoader,
  resetPromise: () => void,
): Promise<XtermRuntime> {
  return loader().catch((error) => {
    resetPromise();
    throw error;
  });
}

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
): XtermRuntimeProvider<XtermRuntime> {
  let runtimePromise: Promise<XtermRuntime> | null = null;
  const reset = () => {
    runtimePromise = null;
  };

  const load = () => {
    if (!runtimePromise) {
      runtimePromise = loadWithResetOnFailure(loader, reset);
    }
    return runtimePromise;
  };

  return {
    load,
    reset,
  };
}

export function loadXtermRuntime(): Promise<XtermRuntime> {
  return importXtermRuntime();
}
