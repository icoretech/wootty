import type { FitAddon } from "@xterm/addon-fit";
import type { IDisposable, Terminal } from "@xterm/xterm";
import {
  Activity,
  Eraser,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RefreshCcw,
  RotateCcw,
  SlidersHorizontal,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type ConnectionStatus,
  clearStoredSessionId,
  createOutbox,
  enqueueOutbox,
  flushOutbox,
  formatLatency,
  parseServerMessage,
  readStoredSessionId,
  reconnectDelayMs,
  storeSessionId,
} from "./lib/terminal-session";
import { loadXtermRuntime } from "./lib/xterm-runtime";

const outputEncoder = new TextEncoder();
const FONT_SIZE_STORAGE_KEY = "wootty.fontSize";
const FONT_SIZE_MIN = 11;
const FONT_SIZE_MAX = 22;
const DEFAULT_FONT_SIZE = 14;

function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function statusLabel(status: ConnectionStatus): string {
  switch (status) {
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "reconnecting":
      return "Reconnecting";
    case "closed":
      return "Closed";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
}

function clampFontSize(value: number): number {
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, value));
}

function readInitialFontSize(): number {
  if (typeof window === "undefined") {
    return DEFAULT_FONT_SIZE;
  }

  const storage = getStorage();
  if (!storage) {
    return DEFAULT_FONT_SIZE;
  }

  const raw = storage.getItem(FONT_SIZE_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_FONT_SIZE;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_FONT_SIZE;
  }

  return clampFontSize(parsed);
}

function addMediaQueryChangeListener(
  mediaQuery: MediaQueryList,
  callback: () => void,
): () => void {
  if ("addEventListener" in mediaQuery) {
    mediaQuery.addEventListener("change", callback);
    return () => {
      mediaQuery.removeEventListener("change", callback);
    };
  }

  const legacyMediaQuery = mediaQuery as MediaQueryList & {
    addListener?: (listener: () => void) => void;
    removeListener?: (listener: () => void) => void;
  };

  legacyMediaQuery.addListener?.(callback);
  return () => {
    legacyMediaQuery.removeListener?.(callback);
  };
}

export default function App() {
  const appViewportRef = useRef<HTMLDivElement | null>(null);
  const terminalElementRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const pongTimeoutRef = useRef<number | null>(null);
  const pingSentAtRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const closedByUserRef = useRef(false);
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const outboxRef = useRef(createOutbox());

  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const initialSessionId = useMemo(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const storage = getStorage();
    if (!storage) {
      return undefined;
    }

    return readStoredSessionId(storage);
  }, []);

  const sessionIdRef = useRef<string | undefined>(initialSessionId);
  const initialFontSize = useMemo(() => readInitialFontSize(), []);

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [sessionId, setSessionId] = useState<string>(initialSessionId ?? "");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [queuedInputBytes, setQueuedInputBytes] = useState<number>(0);
  const [droppedInputBytes, setDroppedInputBytes] = useState<number>(0);
  const [reconnectAttempt, setReconnectAttempt] = useState<number>(0);
  const [outputBytes, setOutputBytes] = useState<number>(0);
  const [terminalReady, setTerminalReady] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<number>(initialFontSize);
  const [controlsOpen, setControlsOpen] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const fontSizeRef = useRef<number>(initialFontSize);

  const wsUrl = useMemo(() => {
    const envUrl = import.meta.env.VITE_WOOTTY_WS_URL as string | undefined;
    if (envUrl && envUrl.length > 0) {
      return envUrl;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/api/terminal`;
  }, []);

  const sendNow = useCallback((payload: object): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    ws.send(JSON.stringify(payload));
    return true;
  }, []);

  const clearTimers = useCallback(() => {
    if (pingTimerRef.current) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }

    if (pongTimeoutRef.current) {
      window.clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = null;
    }

    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const attach = useCallback(() => {
    const term = termRef.current;
    if (!term) {
      return;
    }

    sendNow({
      type: "attach",
      sessionId: sessionIdRef.current,
      cols: term.cols,
      rows: term.rows,
    });
  }, [sendNow]);

  const sendResize = useCallback(
    (cols: number, rows: number) => {
      const sent = sendNow({ type: "resize", cols, rows });
      if (!sent) {
        pendingResizeRef.current = { cols, rows };
      }
    },
    [sendNow],
  );

  const flushPendingResize = useCallback(() => {
    const pending = pendingResizeRef.current;
    if (!pending) {
      return;
    }

    const sent = sendNow({
      type: "resize",
      cols: pending.cols,
      rows: pending.rows,
    });
    if (sent) {
      pendingResizeRef.current = null;
    }
  }, [sendNow]);

  const flushQueuedInput = useCallback(() => {
    const sentBytes = flushOutbox(outboxRef.current, (chunk) => {
      sendNow({ type: "input", data: chunk });
    });

    if (sentBytes > 0) {
      setQueuedInputBytes(outboxRef.current.bytes);
      setDroppedInputBytes(outboxRef.current.droppedBytes);
    }
  }, [sendNow]);

  const queueInput = useCallback(
    (data: string) => {
      const sent = sendNow({ type: "input", data });
      if (sent) {
        return;
      }

      enqueueOutbox(outboxRef.current, data);
      setQueuedInputBytes(outboxRef.current.bytes);
      setDroppedInputBytes(outboxRef.current.droppedBytes);
    },
    [sendNow],
  );

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
      return;
    }

    const shouldReconnect = sessionIdRef.current !== undefined;
    setStatus(shouldReconnect ? "reconnecting" : "connecting");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
      setLatencyMs(null);
      attach();

      if (pingTimerRef.current) {
        window.clearInterval(pingTimerRef.current);
      }

      pingTimerRef.current = window.setInterval(() => {
        pingSentAtRef.current = Date.now();
        sendNow({ type: "ping" });

        if (pongTimeoutRef.current) {
          window.clearTimeout(pongTimeoutRef.current);
        }

        pongTimeoutRef.current = window.setTimeout(() => {
          const activeSocket = wsRef.current;
          if (activeSocket && activeSocket.readyState < WebSocket.CLOSING) {
            activeSocket.close(1013, "pong timeout");
          }
        }, 12_000);
      }, 12_000);
    });

    ws.addEventListener("message", (event) => {
      const term = termRef.current;
      if (!term) {
        return;
      }

      const parsed = parseServerMessage(event.data);
      if (!parsed) {
        return;
      }

      if (parsed.type === "ready") {
        sessionIdRef.current = parsed.sessionId;
        setSessionId(parsed.sessionId);
        setStatus("connected");

        const storage = getStorage();
        if (storage) {
          storeSessionId(storage, parsed.sessionId);
        }

        flushQueuedInput();
        flushPendingResize();
        return;
      }

      if (parsed.type === "output") {
        term.write(parsed.data);
        setOutputBytes(
          (prev) => prev + outputEncoder.encode(parsed.data).length,
        );
        return;
      }

      if (parsed.type === "exit") {
        term.writeln(
          `\r\n\x1b[33m[session ended: code=${parsed.code} signal=${parsed.signal}]\x1b[0m`,
        );
        setStatus("closed");
        return;
      }

      if (parsed.type === "error") {
        term.writeln(`\r\n\x1b[31m[server error] ${parsed.message}\x1b[0m`);
        setStatus("error");
        return;
      }

      if (parsed.type === "pong") {
        if (pongTimeoutRef.current) {
          window.clearTimeout(pongTimeoutRef.current);
          pongTimeoutRef.current = null;
        }

        if (pingSentAtRef.current !== null) {
          setLatencyMs(Date.now() - pingSentAtRef.current);
        }
      }
    });

    ws.addEventListener("close", () => {
      if (pingTimerRef.current) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }

      if (pongTimeoutRef.current) {
        window.clearTimeout(pongTimeoutRef.current);
        pongTimeoutRef.current = null;
      }

      if (closedByUserRef.current) {
        setStatus("closed");
        return;
      }

      setStatus("reconnecting");
      const attempt = reconnectAttemptRef.current;
      const delay = reconnectDelayMs(attempt);
      reconnectAttemptRef.current += 1;
      setReconnectAttempt(reconnectAttemptRef.current);

      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, delay);
    });

    ws.addEventListener("error", () => {
      setStatus("error");
    });
  }, [attach, flushPendingResize, flushQueuedInput, sendNow, wsUrl]);

  const fitAndSyncSize = useCallback(() => {
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) {
      return;
    }

    fitAddon.fit();
    sendResize(term.cols, term.rows);
  }, [sendResize]);

  const applyFontSize = useCallback(
    (next: number) => {
      const normalized = clampFontSize(next);
      fontSizeRef.current = normalized;
      setFontSize(normalized);

      const storage = getStorage();
      if (storage) {
        storage.setItem(FONT_SIZE_STORAGE_KEY, String(normalized));
      }

      const term = termRef.current;
      if (term) {
        term.options.fontSize = normalized;
        fitAndSyncSize();
      }
    },
    [fitAndSyncSize],
  );

  const toggleFullscreen = useCallback(async () => {
    const host = appViewportRef.current;
    if (!host) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await host.requestFullscreen();
  }, []);

  const reconnectNow = useCallback(() => {
    closedByUserRef.current = false;

    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const ws = wsRef.current;
    if (ws && ws.readyState < WebSocket.CLOSING) {
      ws.close(1012, "manual reconnect");
      return;
    }

    connect();
  }, [connect]);

  const clearTerminal = useCallback(() => {
    const term = termRef.current;
    if (!term) {
      return;
    }

    term.clear();
  }, []);

  const startFreshSession = useCallback(() => {
    sessionIdRef.current = undefined;
    setSessionId("");

    const storage = getStorage();
    if (storage) {
      clearStoredSessionId(storage);
    }

    const ws = wsRef.current;
    if (ws && ws.readyState < WebSocket.CLOSING) {
      ws.close(1012, "start fresh session");
      return;
    }

    connect();
  }, [connect]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      setTimeout(() => {
        fitAndSyncSize();
      }, 40);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [fitAndSyncSize]);

  useEffect(() => {
    const terminalRoot = terminalElementRef.current;
    if (!terminalRoot) {
      return;
    }

    let cancelled = false;
    let resizeFrame = 0;
    let observer: ResizeObserver | null = null;
    let disposeInput: IDisposable | null = null;
    let removeMediaQueryListener: (() => void) | null = null;

    const visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        fitAndSyncSize();
      }
    };

    const keyHandler = (event: KeyboardEvent) => {
      const ctrlOrMeta = event.ctrlKey || event.metaKey;
      if (!ctrlOrMeta || !event.shiftKey) {
        return;
      }

      if (event.code === "KeyR") {
        event.preventDefault();
        reconnectNow();
      }

      if (event.code === "KeyK") {
        event.preventDefault();
        clearTerminal();
      }

      if (event.code === "Equal") {
        event.preventDefault();
        applyFontSize(fontSizeRef.current + 1);
      }

      if (event.code === "Minus") {
        event.preventDefault();
        applyFontSize(fontSizeRef.current - 1);
      }

      if (event.code === "Digit0") {
        event.preventDefault();
        applyFontSize(DEFAULT_FONT_SIZE);
      }

      if (event.code === "KeyF") {
        event.preventDefault();
        void toggleFullscreen();
      }

      if (event.code === "KeyB") {
        event.preventDefault();
        setControlsOpen((previous) => !previous);
      }
    };

    const setup = async () => {
      const runtime = await loadXtermRuntime();
      if (cancelled) {
        return;
      }

      const term = new runtime.Terminal({
        cursorBlink: true,
        convertEol: true,
        scrollback: 1_000_000,
        fontFamily:
          "JetBrains Mono, Iosevka, Fira Code, ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: fontSizeRef.current,
        theme: {
          background: "#071014",
          foreground: "#dcf8ff",
          cursor: "#ffcc66",
          selectionBackground: "#2b5e68",
          black: "#0a171c",
        },
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
        queueInput(data);
      });

      observer = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          fitAndSyncSize();
        });
      });
      observer.observe(terminalRoot);

      const mediaQuery = window.matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`,
      );
      removeMediaQueryListener = addMediaQueryChangeListener(
        mediaQuery,
        fitAndSyncSize,
      );

      document.addEventListener("visibilitychange", visibilityHandler);
      window.addEventListener("keydown", keyHandler);

      connect();
    };

    void setup();

    return () => {
      cancelled = true;
      setTerminalReady(false);
      disposeInput?.dispose();
      observer?.disconnect();
      cancelAnimationFrame(resizeFrame);
      removeMediaQueryListener?.();
      document.removeEventListener("visibilitychange", visibilityHandler);
      window.removeEventListener("keydown", keyHandler);

      closedByUserRef.current = true;
      clearTimers();

      const ws = wsRef.current;
      if (ws && ws.readyState < WebSocket.CLOSING) {
        ws.close(1000, "component unmount");
      }

      termRef.current?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [
    applyFontSize,
    clearTerminal,
    clearTimers,
    connect,
    fitAndSyncSize,
    queueInput,
    reconnectNow,
    toggleFullscreen,
  ]);

  const statusText = statusLabel(status);
  const sessionDisplay = sessionId || "pending";
  const statusAnnouncement = terminalReady
    ? status === "reconnecting"
      ? `Reconnecting. Attempt ${reconnectAttempt}.`
      : `Connection status ${statusText}.`
    : "Loading terminal runtime.";

  const statusIcon = status === "connected" ? Wifi : WifiOff;
  const StatusIcon = statusIcon;

  return (
    <main
      className={`shell ${isFullscreen ? "is-fullscreen" : ""}`}
      ref={appViewportRef}
    >
      <div className="shell__background" />

      <output
        className="sr-only"
        aria-live="polite"
        data-testid="status-announcement"
      >
        {statusAnnouncement}
      </output>

      <section className="workspace">
        <section
          className="terminal-wrap"
          ref={terminalElementRef}
          data-testid="terminal-wrap"
          aria-busy={!terminalReady}
          aria-label="Terminal viewport"
        >
          {status !== "connected" && (
            <div className="terminal-overlay" aria-live="polite">
              <p>{terminalReady ? statusText : "Loading terminal engine"}</p>
              <small>
                {terminalReady
                  ? status === "reconnecting"
                    ? "Connection lost. Restoring session and replaying output."
                    : "Preparing terminal transport."
                  : "Downloading terminal runtime and preparing renderer."}
              </small>
            </div>
          )}
        </section>

        <aside
          className={`floating-controls ${controlsOpen ? "is-open" : ""}`}
          aria-label="Terminal controls"
        >
          <button
            type="button"
            onClick={reconnectNow}
            data-testid="reconnect-button"
            disabled={!terminalReady}
            aria-keyshortcuts="Control+Shift+R Meta+Shift+R"
            aria-label="Reconnect terminal session"
            title="Reconnect"
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            onClick={clearTerminal}
            data-testid="clear-button"
            disabled={!terminalReady}
            aria-keyshortcuts="Control+Shift+K Meta+Shift+K"
            aria-label="Clear terminal viewport"
            title="Clear"
          >
            <Eraser size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              applyFontSize(fontSize - 1);
            }}
            data-testid="font-decrease-button"
            disabled={!terminalReady || fontSize <= FONT_SIZE_MIN}
            aria-keyshortcuts="Control+Shift+- Meta+Shift+-"
            aria-label="Decrease terminal font size"
            title="Font down"
          >
            <Minus size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              applyFontSize(fontSize + 1);
            }}
            data-testid="font-increase-button"
            disabled={!terminalReady || fontSize >= FONT_SIZE_MAX}
            aria-keyshortcuts="Control+Shift+= Meta+Shift+="
            aria-label="Increase terminal font size"
            title="Font up"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              applyFontSize(DEFAULT_FONT_SIZE);
            }}
            data-testid="font-reset-button"
            disabled={!terminalReady || fontSize === DEFAULT_FONT_SIZE}
            aria-keyshortcuts="Control+Shift+0 Meta+Shift+0"
            aria-label="Reset terminal font size"
            title="Reset font"
          >
            <RefreshCcw size={16} />
          </button>
          <button
            type="button"
            onClick={startFreshSession}
            data-testid="new-session-button"
            disabled={!terminalReady}
            aria-label="Start a fresh terminal session"
            title="New session"
          >
            <Activity size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              void toggleFullscreen();
            }}
            data-testid="fullscreen-button"
            disabled={!terminalReady}
            aria-label={
              isFullscreen
                ? "Exit fullscreen terminal"
                : "Enter fullscreen terminal"
            }
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </aside>
      </section>

      <footer className="statusbar">
        <div className="statusbar__group">
          <span className="status-pill" data-status={status}>
            <StatusIcon size={13} aria-hidden="true" />
            <span data-testid="status-label">{statusText}</span>
          </span>
          <span className="status-item">
            Session{" "}
            <strong data-testid="session-value">{sessionDisplay}</strong>
          </span>
          <span className="status-item">
            Latency{" "}
            <strong data-testid="latency-value">
              {formatLatency(latencyMs)}
            </strong>
          </span>
          <button
            type="button"
            className="controls-toggle statusbar-toggle"
            data-testid="controls-toggle"
            aria-expanded={controlsOpen}
            aria-label={
              controlsOpen ? "Hide terminal controls" : "Show terminal controls"
            }
            onClick={() => {
              setControlsOpen((previous) => !previous);
            }}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="statusbar__group">
          <span className="status-item">
            Reconnects <strong>{reconnectAttempt}</strong>
          </span>
          <span className="status-item">
            Buffered <strong>{queuedInputBytes} B</strong>
          </span>
          <span className="status-item">
            Dropped <strong>{droppedInputBytes} B</strong>
          </span>
          <span className="status-item">
            Output <strong data-testid="output-value">{outputBytes} B</strong>
          </span>
        </div>
      </footer>
    </main>
  );
}
