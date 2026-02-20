import type { FitAddon } from "@xterm/addon-fit";
import type { IDisposable, Terminal } from "@xterm/xterm";
import {
  ChevronDown,
  Eraser,
  Eye,
  History,
  Maximize2,
  Minimize2,
  Minus,
  Play,
  Plus,
  RefreshCcw,
  RotateCcw,
  SlidersHorizontal,
  SquareTerminal,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ACTIVE_SESSION_STORAGE_KEY,
  type ConnectionStatus,
  clearStoredSessionId,
  createOutbox,
  enqueueOutbox,
  flushOutbox,
  formatLatency,
  LAST_SESSION_STORAGE_KEY,
  parseServerMessage,
  pushSessionHistory,
  readSessionHistory,
  readStoredSessionId,
  reconnectDelayMs,
  storeSessionId,
  writeSessionHistory,
} from "./lib/terminal-session";
import { loadXtermRuntime } from "./lib/xterm-runtime";

const outputEncoder = new TextEncoder();
const FONT_SIZE_STORAGE_KEY = "wootty.fontSize";
const FONT_SIZE_MIN = 11;
const FONT_SIZE_MAX = 22;
const DEFAULT_FONT_SIZE = 14;
const CLOSE_CODE_PONG_TIMEOUT = 4103;
const CLOSE_CODE_MANUAL_RECONNECT = 4101;
const CLOSE_CODE_NEW_SESSION = 4102;

function getLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
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

  const storage = getLocalStorage();
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

type LatencyTone = "neutral" | "good" | "warn" | "bad";
type AttachMode = "control" | "watch";

interface SessionSnapshot {
  readonly id: string;
  readonly hasController: boolean;
  readonly watchers: number;
  readonly createdAtMs: number;
  readonly lastActivityMs: number;
  readonly command: string;
}

interface SessionCandidate {
  readonly id: string;
  readonly action: "resume" | "watch";
  readonly source: "live" | "history";
  readonly command: string;
  readonly watchers: number;
  readonly lastActivityMs: number;
}

function latencyTone(
  status: ConnectionStatus,
  latencyMs: number | null,
): LatencyTone {
  if (status !== "connected" || latencyMs === null) {
    return "neutral";
  }
  if (latencyMs <= 90) {
    return "good";
  }
  if (latencyMs <= 250) {
    return "warn";
  }
  return "bad";
}

function parseSessionsResponse(raw: unknown): SessionSnapshot[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }

  const payload = raw as { sessions?: unknown };
  if (!Array.isArray(payload.sessions)) {
    return [];
  }

  return payload.sessions
    .map((entry): SessionSnapshot | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      if (typeof record.id !== "string" || record.id.length === 0) {
        return null;
      }
      return {
        id: record.id,
        hasController: Boolean(record.hasController),
        watchers:
          typeof record.watchers === "number" &&
          Number.isFinite(record.watchers)
            ? Math.max(0, Math.floor(record.watchers))
            : 0,
        createdAtMs:
          typeof record.createdAtMs === "number" &&
          Number.isFinite(record.createdAtMs)
            ? record.createdAtMs
            : 0,
        lastActivityMs:
          typeof record.lastActivityMs === "number" &&
          Number.isFinite(record.lastActivityMs)
            ? record.lastActivityMs
            : 0,
        command: typeof record.command === "string" ? record.command : "",
      };
    })
    .filter((entry): entry is SessionSnapshot => entry !== null);
}

function ageLabel(timestampMs: number): string {
  if (timestampMs <= 0) {
    return "active recently";
  }

  const elapsed = Date.now() - timestampMs;
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return "active recently";
  }

  const seconds = Math.floor(elapsed / 1_000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function shortSessionId(value: string): string {
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
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
  const sessionMenuRef = useRef<HTMLDivElement | null>(null);
  const sessionButtonRef = useRef<HTMLDivElement | null>(null);

  const initialSessionId = useMemo(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const storage = getSessionStorage();
    if (!storage) {
      return undefined;
    }

    return readStoredSessionId(storage, ACTIVE_SESSION_STORAGE_KEY);
  }, []);

  const initialLastSessionId = useMemo(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const storage = getLocalStorage();
    if (!storage) {
      return undefined;
    }

    return readStoredSessionId(storage, LAST_SESSION_STORAGE_KEY);
  }, []);

  const initialSessionHistory = useMemo(() => {
    if (typeof window === "undefined") {
      return [];
    }

    const storage = getLocalStorage();
    if (!storage) {
      return [];
    }

    return readSessionHistory(storage);
  }, []);

  const sessionIdRef = useRef<string | undefined>(initialSessionId);
  const attachModeRef = useRef<AttachMode>("control");
  const initialFontSize = useMemo(() => readInitialFontSize(), []);

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [sessionId, setSessionId] = useState<string>(initialSessionId ?? "");
  const [lastSessionId, setLastSessionId] = useState<string>(
    initialLastSessionId ?? "",
  );
  const [resumableSessions, setResumableSessions] = useState<string[]>(
    initialSessionHistory,
  );
  const [liveSessions, setLiveSessions] = useState<SessionSnapshot[]>([]);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [queuedInputBytes, setQueuedInputBytes] = useState<number>(0);
  const [droppedInputBytes, setDroppedInputBytes] = useState<number>(0);
  const [reconnectAttempt, setReconnectAttempt] = useState<number>(0);
  const [outputBytes, setOutputBytes] = useState<number>(0);
  const [terminalReady, setTerminalReady] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<number>(initialFontSize);
  const [controlsOpen, setControlsOpen] = useState<boolean>(true);
  const [sessionMenuOpen, setSessionMenuOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [attachMode, setAttachMode] = useState<AttachMode>("control");

  const fontSizeRef = useRef<number>(initialFontSize);

  const wsUrl = useMemo(() => {
    const envUrl = import.meta.env.VITE_WOOTTY_WS_URL as string | undefined;
    if (envUrl && envUrl.length > 0) {
      return envUrl;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/api/terminal`;
  }, []);

  const setSessionMode = useCallback((mode: AttachMode) => {
    attachModeRef.current = mode;
    setAttachMode(mode);
  }, []);

  const refreshLiveSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/sessions", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as unknown;
      setLiveSessions(parseSessionsResponse(payload));
    } catch {
      // Keep existing session list if the endpoint is unavailable.
    }
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
      watch: attachModeRef.current === "watch",
    });
  }, [sendNow]);

  const sendResize = useCallback(
    (cols: number, rows: number) => {
      if (attachModeRef.current === "watch") {
        pendingResizeRef.current = null;
        return;
      }
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
      if (attachModeRef.current === "watch") {
        return;
      }
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
            activeSocket.close(CLOSE_CODE_PONG_TIMEOUT, "pong timeout");
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
        const nextMode: AttachMode = parsed.readOnly ? "watch" : "control";
        setSessionMode(nextMode);
        sessionIdRef.current = parsed.sessionId;
        setSessionId(parsed.sessionId);
        setStatus("connected");

        const localStorageRef = getLocalStorage();
        if (localStorageRef) {
          storeSessionId(
            localStorageRef,
            LAST_SESSION_STORAGE_KEY,
            parsed.sessionId,
          );
          const nextHistory = pushSessionHistory(
            readSessionHistory(localStorageRef),
            parsed.sessionId,
          );
          writeSessionHistory(localStorageRef, nextHistory);
          setResumableSessions(nextHistory);
        }
        setLastSessionId(parsed.sessionId);

        const sessionStorageRef = getSessionStorage();
        if (sessionStorageRef) {
          storeSessionId(
            sessionStorageRef,
            ACTIVE_SESSION_STORAGE_KEY,
            parsed.sessionId,
          );
        }

        flushQueuedInput();
        flushPendingResize();
        void refreshLiveSessions();
        setSessionMenuOpen(false);
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
      const isCurrentSocket = wsRef.current === ws;
      if (isCurrentSocket) {
        wsRef.current = null;
      }
      if (!isCurrentSocket && wsRef.current !== null) {
        return;
      }

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
  }, [
    attach,
    flushPendingResize,
    flushQueuedInput,
    refreshLiveSessions,
    sendNow,
    setSessionMode,
    wsUrl,
  ]);

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

      const storage = getLocalStorage();
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
      ws.close(CLOSE_CODE_MANUAL_RECONNECT, "manual reconnect");
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
    setSessionMode("control");
    sessionIdRef.current = undefined;
    setSessionId("");
    setSessionMenuOpen(false);
    setStatus("connecting");
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);

    const sessionStorageRef = getSessionStorage();
    if (sessionStorageRef) {
      clearStoredSessionId(sessionStorageRef, ACTIVE_SESSION_STORAGE_KEY);
    }

    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const ws = wsRef.current;
    if (ws && ws.readyState < WebSocket.CLOSING) {
      wsRef.current = null;
      ws.close(CLOSE_CODE_NEW_SESSION, "start fresh session");
      window.setTimeout(() => {
        connect();
      }, 30);
      return;
    }

    connect();
  }, [connect, setSessionMode]);

  const resumeSession = useCallback(
    (targetSessionId: string, mode: AttachMode = "control") => {
      if (!targetSessionId) {
        return;
      }

      setSessionMode(mode);
      sessionIdRef.current = targetSessionId;
      setSessionId(targetSessionId);
      setSessionMenuOpen(false);

      const storage = getSessionStorage();
      if (storage) {
        storeSessionId(storage, ACTIVE_SESSION_STORAGE_KEY, targetSessionId);
      }

      reconnectNow();
    },
    [reconnectNow, setSessionMode],
  );

  const resumePreviousSession = useCallback(() => {
    if (!lastSessionId) {
      return;
    }

    resumeSession(lastSessionId, "control");
  }, [lastSessionId, resumeSession]);

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
    if (!sessionMenuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (sessionMenuRef.current?.contains(target)) {
        return;
      }
      if (sessionButtonRef.current?.contains(target)) {
        return;
      }
      setSessionMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSessionMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [sessionMenuOpen]);

  useEffect(() => {
    if (!sessionMenuOpen) {
      return;
    }

    void refreshLiveSessions();
    const timer = window.setInterval(() => {
      void refreshLiveSessions();
    }, 4_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshLiveSessions, sessionMenuOpen]);

  useEffect(() => {
    const modeLabel = attachMode === "watch" ? "WATCH" : "LIVE";
    const statusText = statusLabel(status).toUpperCase();
    const idText = sessionId ? shortSessionId(sessionId) : "pending";
    document.title = `${modeLabel} ${idText} ${statusText} · WooTTY`;
  }, [attachMode, sessionId, status]);

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
        allowTransparency: true,
        convertEol: true,
        scrollback: 1_000_000,
        fontFamily:
          "JetBrains Mono, Iosevka, Fira Code, ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: fontSizeRef.current,
        theme: {
          background: "#00000000",
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
  const sessionDisplay = sessionId ? shortSessionId(sessionId) : "pending";
  const fallbackHistory =
    resumableSessions.length > 0
      ? resumableSessions
      : lastSessionId
        ? [lastSessionId]
        : [];
  const sessionCandidatesDisplay: SessionCandidate[] = [];
  const seenSessionIds = new Set<string>();

  for (const live of [...liveSessions].sort(
    (left, right) => right.lastActivityMs - left.lastActivityMs,
  )) {
    if (live.id === sessionId || seenSessionIds.has(live.id)) {
      continue;
    }
    seenSessionIds.add(live.id);
    sessionCandidatesDisplay.push({
      id: live.id,
      action: live.hasController ? "watch" : "resume",
      source: "live",
      command: live.command,
      watchers: live.watchers,
      lastActivityMs: live.lastActivityMs,
    });
  }

  for (const historical of fallbackHistory) {
    if (
      !historical ||
      historical === sessionId ||
      seenSessionIds.has(historical)
    ) {
      continue;
    }
    seenSessionIds.add(historical);
    sessionCandidatesDisplay.push({
      id: historical,
      action: "resume",
      source: "history",
      command: "",
      watchers: 0,
      lastActivityMs: 0,
    });
  }

  const modeLabel = attachMode === "watch" ? "Read-only watch" : "Control";
  const statusAnnouncement = terminalReady
    ? status === "reconnecting"
      ? `Reconnecting. Attempt ${reconnectAttempt}.`
      : `Connection status ${statusText}. ${modeLabel} mode.`
    : "Loading terminal runtime.";

  const statusIcon = status === "connected" ? Wifi : WifiOff;
  const StatusIcon = statusIcon;
  const tone = latencyTone(status, latencyMs);

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
              <div className="empty-state">
                <div className="empty-state__icon" aria-hidden="true">
                  <SquareTerminal size={20} />
                </div>
                <p>{terminalReady ? statusText : "Loading terminal engine"}</p>
                <small>
                  {terminalReady
                    ? status === "reconnecting"
                      ? "Connection lost. Restoring session and replaying output."
                      : "Preparing terminal transport."
                    : "Downloading terminal runtime and preparing renderer."}
                </small>
              </div>
            </div>
          )}
        </section>

        <aside
          className={`floating-controls ${controlsOpen ? "is-open" : ""}`}
          aria-label="Terminal controls"
        >
          <div className="floating-controls__item">
            <button
              type="button"
              onClick={reconnectNow}
              data-testid="reconnect-button"
              disabled={!terminalReady}
              aria-keyshortcuts="Control+Shift+R Meta+Shift+R"
              aria-label="Reconnect terminal session"
            >
              <RotateCcw size={16} />
            </button>
            <span className="floating-controls__tooltip">Reconnect</span>
          </div>
          <div className="floating-controls__item">
            <button
              type="button"
              onClick={clearTerminal}
              data-testid="clear-button"
              disabled={!terminalReady}
              aria-keyshortcuts="Control+Shift+K Meta+Shift+K"
              aria-label="Clear terminal viewport"
            >
              <Eraser size={16} />
            </button>
            <span className="floating-controls__tooltip">Clear</span>
          </div>
          <div className="floating-controls__item">
            <button
              type="button"
              onClick={() => {
                applyFontSize(fontSize - 1);
              }}
              data-testid="font-decrease-button"
              disabled={!terminalReady || fontSize <= FONT_SIZE_MIN}
              aria-keyshortcuts="Control+Shift+- Meta+Shift+-"
              aria-label="Decrease terminal font size"
            >
              <Minus size={16} />
            </button>
            <span className="floating-controls__tooltip">Font down</span>
          </div>
          <div className="floating-controls__item">
            <button
              type="button"
              onClick={() => {
                applyFontSize(fontSize + 1);
              }}
              data-testid="font-increase-button"
              disabled={!terminalReady || fontSize >= FONT_SIZE_MAX}
              aria-keyshortcuts="Control+Shift+= Meta+Shift+="
              aria-label="Increase terminal font size"
            >
              <Plus size={16} />
            </button>
            <span className="floating-controls__tooltip">Font up</span>
          </div>
          <div className="floating-controls__item">
            <button
              type="button"
              onClick={() => {
                applyFontSize(DEFAULT_FONT_SIZE);
              }}
              data-testid="font-reset-button"
              disabled={!terminalReady || fontSize === DEFAULT_FONT_SIZE}
              aria-keyshortcuts="Control+Shift+0 Meta+Shift+0"
              aria-label="Reset terminal font size"
            >
              <RefreshCcw size={16} />
            </button>
            <span className="floating-controls__tooltip">Reset font</span>
          </div>
          <div className="floating-controls__item">
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
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <span className="floating-controls__tooltip">
              {isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            </span>
          </div>
        </aside>

        {sessionMenuOpen && (
          <div className="session-popover-layer" ref={sessionMenuRef}>
            <div className="session-menu" data-testid="session-menu">
              <button
                type="button"
                className="session-menu__action"
                data-testid="session-menu-new"
                onClick={startFreshSession}
                disabled={!terminalReady}
              >
                <Plus size={14} aria-hidden="true" />
                New session
              </button>
              <button
                type="button"
                className="session-menu__action"
                data-testid="session-menu-resume-last"
                onClick={resumePreviousSession}
                disabled={!terminalReady || !lastSessionId}
              >
                <History size={14} aria-hidden="true" />
                Resume last
              </button>
              <div className="session-menu__list">
                {sessionCandidatesDisplay.length === 0 ? (
                  <p className="session-menu__empty">No resumable sessions</p>
                ) : (
                  sessionCandidatesDisplay.map((candidate) => {
                    const actionLabel =
                      candidate.action === "watch" ? "Watch" : "Resume";
                    const secondaryParts = [
                      candidate.command || "interactive shell",
                      ageLabel(candidate.lastActivityMs),
                    ];
                    if (candidate.watchers > 0) {
                      secondaryParts.push(
                        `${candidate.watchers} watcher${candidate.watchers === 1 ? "" : "s"}`,
                      );
                    }
                    if (candidate.source === "history") {
                      secondaryParts.push("from history");
                    }

                    return (
                      <button
                        key={`${candidate.source}:${candidate.id}`}
                        type="button"
                        className="session-menu__resume"
                        data-testid={
                          candidate.action === "watch"
                            ? "session-menu-watch-item"
                            : "session-menu-resume-item"
                        }
                        onClick={() => {
                          resumeSession(
                            candidate.id,
                            candidate.action === "watch" ? "watch" : "control",
                          );
                        }}
                        disabled={!terminalReady}
                      >
                        <span className="session-menu__primary">
                          {shortSessionId(candidate.id)}
                        </span>
                        <span className="session-menu__secondary">
                          {secondaryParts.join(" · ")}
                        </span>
                        <strong>
                          {candidate.action === "watch" ? (
                            <>
                              <Eye size={12} aria-hidden="true" />
                              {actionLabel}
                            </>
                          ) : (
                            <>
                              <Play size={12} aria-hidden="true" />
                              {actionLabel}
                            </>
                          )}
                        </strong>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <footer className="statusbar">
        <div className="statusbar__group">
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

          <span
            className="status-pill"
            data-status={status}
            data-latency={tone}
          >
            <StatusIcon size={13} aria-hidden="true" />
            <span data-testid="status-label">{statusText}</span>
            <span className="status-pill__latency" data-testid="latency-value">
              {formatLatency(latencyMs)}
            </span>
          </span>

          <div className="status-session" ref={sessionButtonRef}>
            <button
              type="button"
              className="status-item status-item--button status-session__button"
              data-testid="session-menu-button"
              aria-expanded={sessionMenuOpen}
              aria-label="Open session menu"
              onClick={() => {
                setSessionMenuOpen((previous) => !previous);
              }}
            >
              <span>Session</span>
              <strong data-testid="session-value">{sessionDisplay}</strong>
              <ChevronDown size={12} aria-hidden="true" />
            </button>
          </div>
          <span className="status-item" data-mode={attachMode}>
            {attachMode === "watch" ? "Read-only" : "Control"}
          </span>
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
