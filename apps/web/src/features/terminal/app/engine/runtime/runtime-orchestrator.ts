import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { readTerminalTheme } from "../../../runtime/terminal-theme";
import type {
  TerminalRuntime,
  TerminalRuntimeDisposable,
  TerminalRuntimeFitAddon,
  TerminalRuntimeTerminal,
} from "../../../runtime/xterm-runtime-contract";

type UseRuntimeOrchestratorArgs = {
  documentRef: Document | null;
  loadRuntime: () => Promise<TerminalRuntime>;
  initialFontSize: number;
  onInput: (data: string) => void;
  onBootError: (details: { reason: string; cause?: unknown }) => void;
};

type RuntimeOrchestrator = {
  terminalElementRef: RefObject<HTMLDivElement | null>;
  terminalReady: boolean;
  clearTerminal: () => void;
  writeOutput: (data: string) => number;
  writeExit: (code: number, signal: number) => void;
  writeServerError: (message: string) => void;
  updateFontSize: (fontSize: number, onResized: () => void) => void;
  fitAndSyncSize: (onResize: (cols: number, rows: number) => void) => void;
};

const outputEncoder = new TextEncoder();

export function useRuntimeOrchestrator({
  documentRef,
  loadRuntime,
  initialFontSize,
  onInput,
  onBootError,
}: UseRuntimeOrchestratorArgs): RuntimeOrchestrator {
  const terminalElementRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<TerminalRuntimeTerminal | null>(null);
  const fitAddonRef = useRef<TerminalRuntimeFitAddon | null>(null);
  const onInputRef = useRef(onInput);
  const onBootErrorRef = useRef(onBootError);
  const [terminalReady, setTerminalReady] = useState<boolean>(false);

  useEffect(() => {
    onInputRef.current = onInput;
  }, [onInput]);

  useEffect(() => {
    onBootErrorRef.current = onBootError;
  }, [onBootError]);

  const clearTerminal = useCallback(() => {
    termRef.current?.clear();
  }, []);

  const writeOutput = useCallback((data: string): number => {
    const term = termRef.current;
    if (!term) {
      return 0;
    }
    term.write(data);
    return outputEncoder.encode(data).length;
  }, []);

  const writeExit = useCallback((code: number, signal: number) => {
    const term = termRef.current;
    if (!term) {
      return;
    }
    term.writeln(
      `\r\n\x1b[33m[session ended: code=${code} signal=${signal}]\x1b[0m`,
    );
  }, []);

  const writeServerError = useCallback((message: string) => {
    const term = termRef.current;
    if (!term) {
      return;
    }
    term.writeln(`\r\n\x1b[31m[server error] ${message}\x1b[0m`);
  }, []);

  const fitAndSyncSize = useCallback(
    (onResize: (cols: number, rows: number) => void) => {
      const term = termRef.current;
      const fitAddon = fitAddonRef.current;
      if (!term || !fitAddon) {
        return;
      }

      fitAddon.fit();
      onResize(term.cols, term.rows);
    },
    [],
  );

  const updateFontSize = useCallback(
    (fontSize: number, onResized: () => void) => {
      const term = termRef.current;
      if (!term) {
        return;
      }
      term.options.fontSize = fontSize;
      onResized();
    },
    [],
  );

  useEffect(() => {
    const terminalRoot = terminalElementRef.current;
    if (!terminalRoot) {
      return;
    }

    let cancelled = false;
    let disposeInput: TerminalRuntimeDisposable | null = null;

    const setup = async () => {
      try {
        const runtime = await loadRuntime();
        if (cancelled) {
          return;
        }

        const term = new runtime.Terminal({
          cursorBlink: true,
          allowTransparency: true,
          convertEol: true,
          scrollback: 1_000_000,
          fontFamily:
            "JetBrains Mono, Iosevka, Fira Code, ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: initialFontSize,
          theme: readTerminalTheme(documentRef),
        });
        const fitAddon = new runtime.FitAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(new runtime.WebLinksAddon());
        term.open(terminalRoot);
        fitAddon.fit();
        termRef.current = term;
        fitAddonRef.current = fitAddon;
        setTerminalReady(true);

        disposeInput = term.onData((data) => {
          onInputRef.current(data);
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        const reason =
          error instanceof Error && error.message.length > 0
            ? error.message
            : "runtime bootstrap failed";
        onBootErrorRef.current({
          reason,
          cause: error,
        });
        setTerminalReady(false);
      }
    };

    void setup();
    return () => {
      cancelled = true;
      setTerminalReady(false);
      disposeInput?.dispose();
      termRef.current?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [documentRef, initialFontSize, loadRuntime]);

  return {
    terminalElementRef,
    terminalReady,
    clearTerminal,
    writeOutput,
    writeExit,
    writeServerError,
    updateFontSize,
    fitAndSyncSize,
  };
}
