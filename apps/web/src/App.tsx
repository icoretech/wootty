import type { FitAddon } from "@xterm/addon-fit";
import type { IDisposable, Terminal } from "@xterm/xterm";
import { SquareTerminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FloatingControls } from "./features/terminal/components/FloatingControls";
import { SessionMenu } from "./features/terminal/components/SessionMenu";
import { StatusBar } from "./features/terminal/components/StatusBar";
import {
  type ConnectionStatus,
  parseServerMessage,
  reconnectDelayMs,
} from "./lib/terminal-protocol";
import {
  createOutbox,
  enqueueOutbox,
  flushOutbox,
} from "./lib/terminal-outbox";
import {
  formatBytes,
  formatLatency,
} from "./lib/terminal-format";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  clearStoredSessionId,
  LAST_SESSION_STORAGE_KEY,
  pushSessionHistory,
  readSessionHistory,
  readStoredSessionId,
  storeSessionId,
  writeSessionHistory,
} from "./lib/session-storage";
import { loadXtermRuntime } from "./lib/xterm-runtime";

const outputEncoder = new TextEncoder();
const FONT_SIZE_STORAGE_KEY = "wootty.fontSize";
const FONT_SIZE_MIN = 11;
const FONT_SIZE_MAX = 22;
const DEFAULT_FONT_SIZE = FONT_SIZE_MIN;
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

function readCssColorVariable(variableName: string, fallback: string): string {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim();
  return value.length > 0 ? value : fallback;
}

function readTerminalTheme() {
  return {
    background: readCssColorVariable("--terminal-bg", "transparent"),
    foreground: readCssColorVariable("--terminal-fg", "aliceblue"),
    cursor: readCssColorVariable("--terminal-cursor", "gold"),
    selectionBackground: readCssColorVariable(
      "--terminal-selection",
      "cadetblue",
    ),
    black: readCssColorVariable("--terminal-black", "black"),
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
  const sessionNoticeTimerRef = useRef<number | null>(null);
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
  const [sessionNotice, setSessionNotice] = useState<string>("");

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

  const publishSessionNotice = useCallback((message: string) => {
    setSessionNotice(message);

    if (sessionNoticeTimerRef.current) {
      window.clearTimeout(sessionNoticeTimerRef.current);
    }

    sessionNoticeTimerRef.current = window.setTimeout(() => {
      setSessionNotice("");
      sessionNoticeTimerRef.current = null;
    }, 4_000);
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
      publishSessionNotice("Unable to refresh live sessions.");
    }
  }, [publishSessionNotice]);

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

    if (sessionNoticeTimerRef.current) {
      window.clearTimeout(sessionNoticeTimerRef.current);
      sessionNoticeTimerRef.current = null;
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

  const handleReadyMessage = useCallback(
    (nextSessionId: string, readOnly: boolean) => {
      const nextMode: AttachMode = readOnly ? "watch" : "control";
      setSessionMode(nextMode);
      setSessionNotice("");
      sessionIdRef.current = nextSessionId;
      setSessionId(nextSessionId);
      setStatus("connected");

      const localStorageRef = getLocalStorage();
      if (localStorageRef) {
        storeSessionId(
          localStorageRef,
          LAST_SESSION_STORAGE_KEY,
          nextSessionId,
        );
        const nextHistory = pushSessionHistory(
          readSessionHistory(localStorageRef),
          nextSessionId,
        );
        writeSessionHistory(localStorageRef, nextHistory);
        setResumableSessions(nextHistory);
      }
      setLastSessionId(nextSessionId);

      const sessionStorageRef = getSessionStorage();
      if (sessionStorageRef) {
        storeSessionId(
          sessionStorageRef,
          ACTIVE_SESSION_STORAGE_KEY,
          nextSessionId,
        );
      }

      flushQueuedInput();
      flushPendingResize();
      void refreshLiveSessions();
      setSessionMenuOpen(false);
    },
    [
      flushPendingResize,
      flushQueuedInput,
      refreshLiveSessions,
      setSessionMode,
    ],
  );

  const handleOutputMessage = useCallback((data: string) => {
    const term = termRef.current;
    if (!term) {
      return;
    }

    term.write(data);
    setOutputBytes((previous) => previous + outputEncoder.encode(data).length);
  }, []);

  const handleExitMessage = useCallback((code: number, signal: number) => {
    const term = termRef.current;
    if (!term) {
      return;
    }

    term.writeln(
      `\r\n\x1b[33m[session ended: code=${code} signal=${signal}]\x1b[0m`,
    );
    setStatus("closed");
  }, []);

  const handleErrorMessage = useCallback(
    (message: string, code?: string) => {
      const term = termRef.current;
      if (term) {
        term.writeln(`\r\n\x1b[31m[server error] ${message}\x1b[0m`);
      }

      if (code === "session_not_found") {
        publishSessionNotice(
          "Selected session is no longer running on the server. Start a new session.",
        );
        const sessionStorageRef = getSessionStorage();
        if (sessionStorageRef) {
          clearStoredSessionId(sessionStorageRef, ACTIVE_SESSION_STORAGE_KEY);
        }
        sessionIdRef.current = undefined;
        setSessionId("");
        setSessionMode("control");
        setStatus("closed");
        void refreshLiveSessions();
        return;
      }

      setStatus("error");
    },
    [publishSessionNotice, refreshLiveSessions, setSessionMode],
  );

  const handlePongMessage = useCallback(() => {
    if (pongTimeoutRef.current) {
      window.clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = null;
    }

    if (pingSentAtRef.current !== null) {
      setLatencyMs(Date.now() - pingSentAtRef.current);
    }
  }, []);

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
      const parsed = parseServerMessage(event.data);
      if (!parsed) {
        publishSessionNotice("Received an unsupported server message.");
        return;
      }

      switch (parsed.type) {
        case "ready":
          handleReadyMessage(parsed.sessionId, parsed.readOnly);
          return;
        case "output":
          handleOutputMessage(parsed.data);
          return;
        case "exit":
          handleExitMessage(parsed.code, parsed.signal);
          return;
        case "error":
          handleErrorMessage(parsed.message, parsed.code);
          return;
        case "pong":
          handlePongMessage();
          return;
        default:
          publishSessionNotice("Received an unsupported server message.");
          return;
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
    handleErrorMessage,
    handleExitMessage,
    handleOutputMessage,
    handlePongMessage,
    handleReadyMessage,
    publishSessionNotice,
    sendNow,
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

  const prepareSessionSwitch = useCallback(() => {
    const term = termRef.current;
    if (term) {
      term.clear();
    }

    outboxRef.current.chunks.length = 0;
    outboxRef.current.bytes = 0;
    outboxRef.current.droppedBytes = 0;
    pendingResizeRef.current = null;

    setOutputBytes(0);
    setQueuedInputBytes(0);
    setDroppedInputBytes(0);
  }, []);

  const startFreshSession = useCallback(() => {
    prepareSessionSwitch();
    setSessionNotice("");
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
  }, [connect, prepareSessionSwitch, setSessionMode]);

  const resumeSession = useCallback(
    (targetSessionId: string, mode: AttachMode = "control") => {
      if (!targetSessionId) {
        return;
      }

      prepareSessionSwitch();
      setSessionNotice("");
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
    [prepareSessionSwitch, reconnectNow, setSessionMode],
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
        theme: readTerminalTheme(),
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
  const liveSessionCandidates: SessionCandidate[] = [];
  const historySessionCandidates: string[] = [];
  const seenSessionIds = new Set<string>();

  for (const live of [...liveSessions].sort(
    (left, right) => right.lastActivityMs - left.lastActivityMs,
  )) {
    if (live.id === sessionId || seenSessionIds.has(live.id)) {
      continue;
    }
    seenSessionIds.add(live.id);
    liveSessionCandidates.push({
      id: live.id,
      action: live.hasController ? "watch" : "resume",
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
    historySessionCandidates.push(historical);
  }

  const modeLabel = attachMode === "watch" ? "Read-only watch" : "Control";
  const statusAnnouncement = terminalReady
    ? status === "reconnecting"
      ? `Reconnecting. Attempt ${reconnectAttempt}.`
      : `Connection status ${statusText}. ${modeLabel} mode.`
    : "Loading terminal runtime.";

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

        <FloatingControls
          controlsOpen={controlsOpen}
          terminalReady={terminalReady}
          fontSize={fontSize}
          fontSizeMin={FONT_SIZE_MIN}
          fontSizeMax={FONT_SIZE_MAX}
          defaultFontSize={DEFAULT_FONT_SIZE}
          isFullscreen={isFullscreen}
          onReconnect={reconnectNow}
          onClearTerminal={clearTerminal}
          onApplyFontSize={applyFontSize}
          onToggleFullscreen={toggleFullscreen}
        />

        {sessionMenuOpen && (
          <div className="session-popover-layer" ref={sessionMenuRef}>
            <SessionMenu
              open={sessionMenuOpen}
              terminalReady={terminalReady}
              lastSessionId={lastSessionId}
              sessionNotice={sessionNotice}
              liveSessionCandidates={liveSessionCandidates}
              historySessionCandidates={historySessionCandidates}
              onStartFreshSession={startFreshSession}
              onResumePreviousSession={resumePreviousSession}
              onResumeSession={resumeSession}
              formatSessionId={shortSessionId}
              formatAgeLabel={ageLabel}
            />
          </div>
        )}
      </section>

      <StatusBar
        controlsOpen={controlsOpen}
        sessionMenuOpen={sessionMenuOpen}
        status={status}
        latencyTone={tone}
        statusText={statusText}
        latencyText={formatLatency(latencyMs)}
        sessionDisplay={sessionDisplay}
        attachMode={attachMode}
        reconnectAttempt={reconnectAttempt}
        queuedInputText={formatBytes(queuedInputBytes)}
        droppedInputText={formatBytes(droppedInputBytes)}
        outputText={formatBytes(outputBytes)}
        outputBytes={outputBytes}
        sessionButtonRef={sessionButtonRef}
        onToggleControls={() => {
          setControlsOpen((previous) => !previous);
        }}
        onToggleSessionMenu={() => {
          setSessionMenuOpen((previous) => !previous);
        }}
      />
    </main>
  );
}
