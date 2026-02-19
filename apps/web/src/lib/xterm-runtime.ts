import type { FitAddon } from "@xterm/addon-fit";
import type { WebLinksAddon } from "@xterm/addon-web-links";
import type { Terminal } from "@xterm/xterm";

interface XtermRuntime {
  Terminal: typeof Terminal;
  FitAddon: typeof FitAddon;
  WebLinksAddon: typeof WebLinksAddon;
}

let runtimePromise: Promise<XtermRuntime> | null = null;

export function loadXtermRuntime(): Promise<XtermRuntime> {
  if (!runtimePromise) {
    runtimePromise = Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
      import("@xterm/addon-web-links"),
      import("@xterm/xterm/css/xterm.css"),
    ]).then(([xterm, fitAddon, webLinksAddon]) => ({
      Terminal: xterm.Terminal,
      FitAddon: fitAddon.FitAddon,
      WebLinksAddon: webLinksAddon.WebLinksAddon,
    }));
  }

  return runtimePromise;
}
