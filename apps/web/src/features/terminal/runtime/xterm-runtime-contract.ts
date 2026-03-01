export interface TerminalRuntimeDisposable {
  dispose(): void;
}

export interface TerminalRuntimeMountElement extends Element {}

export interface TerminalRuntimeAddon {
  activate(terminal: TerminalRuntimeTerminal): void;
  dispose(): void;
}

export interface TerminalRuntimeWebLinksAddon extends TerminalRuntimeAddon {}

export type TerminalRuntimeTerminalOptions = {
  cursorBlink?: boolean;
  allowTransparency?: boolean;
  convertEol?: boolean;
  scrollback?: number;
  fontFamily?: string;
  fontSize?: number;
  theme?: Record<string, string>;
};

export interface TerminalRuntimeTerminal {
  cols: number;
  rows: number;
  options: { fontSize?: number };
  loadAddon(addon: TerminalRuntimeAddon): void;
  open(element: TerminalRuntimeMountElement): void;
  write(data: string): void;
  writeln(data: string): void;
  clear(): void;
  dispose(): void;
  onData(handler: (data: string) => void): TerminalRuntimeDisposable;
}

export interface TerminalRuntimeFitAddon {
  activate(terminal: TerminalRuntimeTerminal): void;
  fit(): void;
  dispose(): void;
}

export interface TerminalRuntime {
  Terminal: new (
    options?: TerminalRuntimeTerminalOptions,
  ) => TerminalRuntimeTerminal;
  FitAddon: new () => TerminalRuntimeFitAddon;
  WebLinksAddon: new () => TerminalRuntimeWebLinksAddon;
}

export type XtermRuntimeProvider<TTerminalRuntime extends TerminalRuntime> = {
  load: () => Promise<TTerminalRuntime>;
  reset: () => void;
};
