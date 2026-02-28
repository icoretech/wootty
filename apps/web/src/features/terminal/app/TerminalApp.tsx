import { SquareTerminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FloatingControlsAction,
  FloatingControlsModel,
} from "../components/FloatingControls";
import { FloatingControls } from "../components/FloatingControls";
import { presentSessionCandidate } from "../components/presenters/session-menu-presenter";
import {
  ageLabel,
  latencyTone,
  shortSessionId,
  statusLabel,
} from "../components/presenters/terminal-view-model";
import type {
  SessionMenuAction,
  SessionMenuModel,
} from "../components/SessionMenu";
import { SessionMenu } from "../components/SessionMenu";
import type { StatusBarAction, StatusBarModel } from "../components/StatusBar";
import { StatusBar } from "../components/StatusBar";
import type { ConnectionStatus } from "../contracts/connection";
import {
  type AttachMode,
  type SessionSnapshot,
  TERMINAL_SERVER_ERROR_CODE,
  type TerminalServerErrorCode,
} from "../contracts/session";
import {
  type TerminalTransport,
  type TerminalTransportCloseEvent,
  type TerminalTransportErrorEvent,
  type TerminalTransportMessageEvent,
  TRANSPORT_READY_STATE,
} from "../contracts/transport";
import {
  reconnectDelayMs,
  TERMINAL_CLOSE_CODE,
  TERMINAL_HEARTBEAT_MS,
} from "../contracts/transport-policy";
import { formatBytes, formatLatency } from "../lib/terminal-format";
import {
  createOutbox,
  enqueueOutbox,
  flushOutbox,
} from "../lib/terminal-outbox";
import { toUserNotice } from "../notifications/user-notice";
import { parseServerMessageWithReason } from "../protocol/terminal-protocol";
import type {
  TerminalRuntimeDisposable,
  TerminalRuntimeFitAddon,
  TerminalRuntimeTerminal,
} from "../runtime/xterm-runtime";
import {
  deriveSessionCandidates,
  parseSessionsResponse,
} from "../session/domain/session-contract";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  clearStoredSessionId,
  LAST_SESSION_STORAGE_KEY,
  pushSessionHistory,
  readSessionHistory,
  readStoredSessionId,
  storeSessionId,
  writeSessionHistory,
} from "../session/persistence/session-storage";
import {
  defaultTerminalAppEnvironment,
  type TerminalAppEnvironment,
} from "./environment";

const outputEncoder = new TextEncoder();
const FONT_SIZE_STORAGE_KEY = "wootty.fontSize";
const FONT_SIZE_MIN = 11;
const FONT_SIZE_MAX = 22;
const DEFAULT_FONT_SIZE = FONT_SIZE_MIN;

type TerminalAppProps = {
  environment?: TerminalAppEnvironment;
};

function clampFontSize(value: number): number {
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, value));
}

function readInitialFontSize(storage: Storage | null): number {
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

function readCssColorVariable(
  doc: Document | null,
  variableName: string,
  fallback: string,
): string {
  if (!doc) {
    return fallback;
  }

  const value = getComputedStyle(doc.documentElement)
    .getPropertyValue(variableName)
    .trim();
  return value.length > 0 ? value : fallback;
}

function readTerminalTheme(doc: Document | null) {
  return {
    background: readCssColorVariable(doc, "--terminal-bg", "transparent"),
    foreground: readCssColorVariable(doc, "--terminal-fg", "aliceblue"),
    cursor: readCssColorVariable(doc, "--terminal-cursor", "gold"),
    selectionBackground: readCssColorVariable(
      doc,
      "--terminal-selection",
      "cadetblue",
    ),
    black: readCssColorVariable(doc, "--terminal-black", "black"),
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${String(value)}`);
}

export type { TerminalAppEnvironment };

export function TerminalApp({
  environment = defaultTerminalAppEnvironment,
}: TerminalAppProps = {}) {
  const createTransport = environment.createTransport;
  const loadRuntime = environment.loadRuntime;
  const fetchSessions = environment.fetchSessions;
  const getDocument = environment.getDocument;
  const getWindow = environment.getWindow;
  const getLocalStorage = environment.getLocalStorage;
  const getSessionStorage = environment.getSessionStorage;
  const windowRef = getWindow();
  const documentRef = getDocument();

  const appViewportRef = useRef<HTMLDivElement | null>(null);
  const terminalElementRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<TerminalTransport | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const pongTimeoutRef = useRef<number | null>(null);
  const sessionNoticeTimerRef = useRef<number | null>(null);
  const pingSentAtRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const closedByUserRef = useRef(false);
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const outboxRef = useRef(createOutbox());

  const termRef = useRef<TerminalRuntimeTerminal | null>(null);
  const fitAddonRef = useRef<TerminalRuntimeFitAddon | null>(null);
  const sessionMenuRef = useRef<HTMLDivElement | null>(null);
  const sessionButtonRef = useRef<HTMLDivElement | null>(null);

  const initialSessionId = useMemo(() => {
    const storage = getSessionStorage();
    if (!storage) {
      return undefined;
    }

    return readStoredSessionId(storage, ACTIVE_SESSION_STORAGE_KEY);
  }, [getSessionStorage]);

  const initialLastSessionId = useMemo(() => {
    const storage = getLocalStorage();
    if (!storage) {
      return undefined;
    }

    return readStoredSessionId(storage, LAST_SESSION_STORAGE_KEY);
  }, [getLocalStorage]);

  const initialSessionHistory = useMemo(() => {
    const storage = getLocalStorage();
    if (!storage) {
      return [];
    }

    return readSessionHistory(storage);
  }, [getLocalStorage]);

  const sessionIdRef = useRef<string | undefined>(initialSessionId);
  const attachModeRef = useRef<AttachMode>("control");
  const initialFontSize = useMemo(() => {
    return readInitialFontSize(getLocalStorage());
  }, [getLocalStorage]);

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [sessionId, setSessionId] = useState<string>(initialSessionId ?? "");
  const [lastSessionId, setLastSessionId] = useState<string>(
    initialLastSessionId ?? "",
  );
  const [sessionHistoryIds, setSessionHistoryIds] = useState<string[]>(
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
  const [lastSocketFailure, setLastSocketFailure] = useState<string>("");

  const fontSizeRef = useRef<number>(initialFontSize);

  const wsUrl = useMemo(() => {
    const envUrl = import.meta.env.VITE_WOOTTY_WS_URL as string | undefined;
    if (envUrl && envUrl.length > 0) {
      return envUrl;
    }

    if (!windowRef) {
      return "ws://127.0.0.1/api/terminal";
    }

    const protocol = windowRef.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${windowRef.location.host}/api/terminal`;
  }, [windowRef]);

  const setSessionMode = useCallback((mode: AttachMode) => {
    attachModeRef.current = mode;
    setAttachMode(mode);
  }, []);

  const publishSessionNotice = useCallback((message: string) => {
    setSessionNotice(message);

    if (sessionNoticeTimerRef.current) {
      clearTimeout(sessionNoticeTimerRef.current);
    }

    sessionNoticeTimerRef.current = setTimeout(() => {
      setSessionNotice("");
      sessionNoticeTimerRef.current = null;
    }, 4_000);
  }, []);

  const refreshLiveSessions = useCallback(async () => {
    try {
      const response = await fetchSessions();
      if (!response.ok) {
        publishSessionNotice(
          toUserNotice({
            context: "sessions_refresh",
            status: response.status,
          }),
        );
        return;
      }
      const payload = (await response.json()) as unknown;
      const parsed = parseSessionsResponse(payload);
      setLiveSessions(parsed.sessions);
      if (parsed.invalidEntries > 0) {
        publishSessionNotice(
          `Skipped ${parsed.invalidEntries} malformed session entr${parsed.invalidEntries === 1 ? "y" : "ies"}.`,
        );
      }
    } catch (error) {
      publishSessionNotice(
        toUserNotice({ context: "sessions_refresh", cause: error }),
      );
    }
  }, [fetchSessions, publishSessionNotice]);

  const sendNow = useCallback(
    (payload: object): boolean => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== TRANSPORT_READY_STATE.OPEN) {
        return false;
      }

      try {
        ws.send(JSON.stringify(payload));
        return true;
      } catch (error) {
        const reason =
          error instanceof Error && error.message.length > 0
            ? error.message
            : "transport send failed";
        setLastSocketFailure(`error reason=${reason}`);
        publishSessionNotice(
          toUserNotice({
            context: "transport",
            source: "error",
            reason,
          }),
        );
        setStatus("error");
        return false;
      }
    },
    [publishSessionNotice],
  );

  const resetHeartbeatTimers = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }

    if (pongTimeoutRef.current) {
      clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = null;
    }
  }, []);

  const resetConnectionState = useCallback(
    (scope: "transport" | "all" = "transport") => {
      resetHeartbeatTimers();

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (scope === "all" && sessionNoticeTimerRef.current) {
        clearTimeout(sessionNoticeTimerRef.current);
        sessionNoticeTimerRef.current = null;
      }
    },
    [resetHeartbeatTimers],
  );

  const clearTimers = useCallback(() => {
    resetConnectionState("all");
  }, [resetConnectionState]);

  const clearActiveSessionStorage = useCallback(() => {
    const storage = getSessionStorage();
    if (storage) {
      clearStoredSessionId(storage, ACTIVE_SESSION_STORAGE_KEY);
    }
  }, [getSessionStorage]);

  const persistActiveSessionStorage = useCallback(
    (nextSessionId: string) => {
      const storage = getSessionStorage();
      if (storage) {
        storeSessionId(storage, ACTIVE_SESSION_STORAGE_KEY, nextSessionId);
      }
    },
    [getSessionStorage],
  );

  const resetReconnectAttempts = useCallback(() => {
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);
  }, []);

  const handleSocketFailure = useCallback(
    (source: "error" | "close", code?: number, reason?: string) => {
      const contextParts: string[] = [source];
      if (typeof code === "number") {
        contextParts.push(`code=${code}`);
      }
      if (typeof reason === "string" && reason.length > 0) {
        contextParts.push(`reason=${reason}`);
      }

      const context = contextParts.join(" ");
      setLastSocketFailure(context);
      publishSessionNotice(
        toUserNotice({ context: "transport", source, code, reason }),
      );
    },
    [publishSessionNotice],
  );

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
      return sendNow({ type: "input", data: chunk });
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
      resetReconnectAttempts();
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
        setSessionHistoryIds(nextHistory);
      }
      setLastSessionId(nextSessionId);

      persistActiveSessionStorage(nextSessionId);

      flushQueuedInput();
      flushPendingResize();
      void refreshLiveSessions();
      setSessionMenuOpen(false);
    },
    [
      flushPendingResize,
      flushQueuedInput,
      persistActiveSessionStorage,
      refreshLiveSessions,
      resetReconnectAttempts,
      setSessionMode,
      getLocalStorage,
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
    (message: string, code?: TerminalServerErrorCode) => {
      const term = termRef.current;
      if (term) {
        term.writeln(`\r\n\x1b[31m[server error] ${message}\x1b[0m`);
      }

      if (code === TERMINAL_SERVER_ERROR_CODE.SESSION_NOT_FOUND) {
        publishSessionNotice(
          "Selected session is no longer running on the server. Start a new session.",
        );
        clearActiveSessionStorage();
        sessionIdRef.current = undefined;
        setSessionId("");
        setSessionMode("control");
        setSessionMenuOpen(false);
        setStatus("closed");
        void refreshLiveSessions();
        return;
      }

      if (code === TERMINAL_SERVER_ERROR_CODE.ATTACH_FORBIDDEN) {
        publishSessionNotice(
          "Server denied control attach. Switched to watch mode for safety.",
        );
        setSessionMode("watch");
        setStatus("connected");
        return;
      }

      setStatus("error");
    },
    [
      clearActiveSessionStorage,
      publishSessionNotice,
      refreshLiveSessions,
      setSessionMode,
    ],
  );

  const handlePongMessage = useCallback(() => {
    if (pongTimeoutRef.current) {
      clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = null;
    }

    if (pingSentAtRef.current !== null) {
      setLatencyMs(Date.now() - pingSentAtRef.current);
    }
  }, []);

  const handleUnsupportedSocketFrame = useCallback(
    (reason: "unsupported_type" | "malformed_payload") => {
      publishSessionNotice(
        toUserNotice({ context: "protocol", parseReason: reason }),
      );
    },
    [publishSessionNotice],
  );

  const handleSocketOpen = useCallback(
    (_ws: TerminalTransport) => {
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
      setLatencyMs(null);
      setLastSocketFailure("");
      attach();

      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
      }

      pingTimerRef.current = setInterval(() => {
        pingSentAtRef.current = Date.now();
        sendNow({ type: "ping" });

        if (pongTimeoutRef.current) {
          clearTimeout(pongTimeoutRef.current);
        }

        pongTimeoutRef.current = setTimeout(() => {
          const activeSocket = wsRef.current;
          if (
            activeSocket &&
            activeSocket.readyState < TRANSPORT_READY_STATE.CLOSING
          ) {
            activeSocket.close(
              TERMINAL_CLOSE_CODE.PONG_TIMEOUT,
              "pong timeout",
            );
          }
        }, TERMINAL_HEARTBEAT_MS.PONG_TIMEOUT);
      }, TERMINAL_HEARTBEAT_MS.INTERVAL);
    },
    [attach, sendNow],
  );

  const handleSocketMessage = useCallback(
    (event: TerminalTransportMessageEvent) => {
      const parsed = parseServerMessageWithReason(event.data);
      if ("reason" in parsed) {
        handleUnsupportedSocketFrame(parsed.reason);
        return;
      }

      switch (parsed.message.type) {
        case "ready":
          handleReadyMessage(parsed.message.sessionId, parsed.message.readOnly);
          return;
        case "output":
          handleOutputMessage(parsed.message.data);
          return;
        case "exit":
          handleExitMessage(parsed.message.code, parsed.message.signal);
          return;
        case "error":
          handleErrorMessage(parsed.message.message, parsed.message.code);
          return;
        case "pong":
          handlePongMessage();
          return;
        default:
          assertNever(parsed.message);
      }
    },
    [
      handleErrorMessage,
      handleExitMessage,
      handleOutputMessage,
      handlePongMessage,
      handleReadyMessage,
      handleUnsupportedSocketFrame,
    ],
  );

  const handleSocketClose = useCallback(
    (
      ws: TerminalTransport,
      event: TerminalTransportCloseEvent,
      reconnect: () => void,
    ) => {
      const isCurrentSocket = wsRef.current === ws;
      if (isCurrentSocket) {
        wsRef.current = null;
      }
      if (!isCurrentSocket && wsRef.current !== null) {
        return;
      }

      resetConnectionState();

      if (closedByUserRef.current) {
        setStatus("closed");
        return;
      }

      handleSocketFailure("close", event.code, event.reason);
      setStatus("reconnecting");
      const attempt = reconnectAttemptRef.current;
      const delay = reconnectDelayMs(attempt);
      reconnectAttemptRef.current += 1;
      setReconnectAttempt(reconnectAttemptRef.current);

      reconnectTimerRef.current = setTimeout(() => {
        reconnect();
      }, delay);
    },
    [handleSocketFailure, resetConnectionState],
  );

  const handleSocketErrorEvent = useCallback(
    (event: TerminalTransportErrorEvent) => {
      handleSocketFailure("error", undefined, event.message);
      setStatus("error");
    },
    [handleSocketFailure],
  );

  const connect = useCallback(() => {
    if (
      wsRef.current &&
      wsRef.current.readyState <= TRANSPORT_READY_STATE.OPEN
    ) {
      return;
    }

    const shouldReconnect = sessionIdRef.current !== undefined;
    setStatus(shouldReconnect ? "reconnecting" : "connecting");

    const ws = createTransport(wsUrl);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      handleSocketOpen(ws);
    });

    ws.addEventListener("message", (event) => {
      handleSocketMessage(event);
    });

    ws.addEventListener("close", (event) => {
      handleSocketClose(ws, event, connect);
    });

    ws.addEventListener("error", (event) => {
      handleSocketErrorEvent(event);
    });
  }, [
    handleSocketClose,
    handleSocketErrorEvent,
    handleSocketMessage,
    handleSocketOpen,
    createTransport,
    wsUrl,
  ]);

  const scheduleFreshConnection = useCallback(() => {
    resetConnectionState();

    const ws = wsRef.current;
    if (ws && ws.readyState < TRANSPORT_READY_STATE.CLOSING) {
      wsRef.current = null;
      ws.close(TERMINAL_CLOSE_CODE.START_FRESH_SESSION, "start fresh session");
      setTimeout(() => {
        connect();
      }, 30);
      return;
    }

    connect();
  }, [connect, resetConnectionState]);

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
    [fitAndSyncSize, getLocalStorage],
  );

  const toggleFullscreen = useCallback(async () => {
    const host = appViewportRef.current;
    const doc = documentRef;
    if (!host || !doc) {
      return;
    }

    try {
      if (doc.fullscreenElement) {
        await doc.exitFullscreen();
        return;
      }

      await host.requestFullscreen();
    } catch (error) {
      publishSessionNotice(
        toUserNotice({ context: "fullscreen", cause: error }),
      );
    }
  }, [documentRef, publishSessionNotice]);

  const reconnectNow = useCallback(() => {
    closedByUserRef.current = false;
    resetConnectionState();

    const ws = wsRef.current;
    if (ws && ws.readyState < TRANSPORT_READY_STATE.CLOSING) {
      ws.close(TERMINAL_CLOSE_CODE.MANUAL_RECONNECT, "manual reconnect");
      return;
    }

    connect();
  }, [connect, resetConnectionState]);

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

  const transitionSessionContext = useCallback(
    (nextSessionId: string | undefined, nextMode: AttachMode) => {
      prepareSessionSwitch();
      setSessionNotice("");
      setSessionMode(nextMode);
      sessionIdRef.current = nextSessionId;
      setSessionId(nextSessionId ?? "");
      setSessionMenuOpen(false);

      if (nextSessionId) {
        persistActiveSessionStorage(nextSessionId);
      } else {
        clearActiveSessionStorage();
      }
    },
    [
      clearActiveSessionStorage,
      persistActiveSessionStorage,
      prepareSessionSwitch,
      setSessionMode,
    ],
  );

  const startFreshSession = useCallback(() => {
    transitionSessionContext(undefined, "control");
    setStatus("connecting");
    resetReconnectAttempts();
    scheduleFreshConnection();
  }, [
    resetReconnectAttempts,
    scheduleFreshConnection,
    transitionSessionContext,
  ]);

  const attachToSession = useCallback(
    (targetSessionId: string, mode: AttachMode = "control") => {
      if (!targetSessionId) {
        return;
      }
      transitionSessionContext(targetSessionId, mode);
      reconnectNow();
    },
    [reconnectNow, transitionSessionContext],
  );

  const resumePreviousSession = useCallback(() => {
    if (!lastSessionId) {
      return;
    }

    attachToSession(lastSessionId, "control");
  }, [attachToSession, lastSessionId]);

  const dispatchFloatingControls = useCallback(
    (action: FloatingControlsAction) => {
      switch (action.type) {
        case "reconnect":
          reconnectNow();
          return;
        case "clear":
          clearTerminal();
          return;
        case "decreaseFont":
          applyFontSize(fontSizeRef.current - 1);
          return;
        case "increaseFont":
          applyFontSize(fontSizeRef.current + 1);
          return;
        case "resetFont":
          applyFontSize(DEFAULT_FONT_SIZE);
          return;
        case "toggleFullscreen":
          void toggleFullscreen();
          return;
        default:
          assertNever(action);
      }
    },
    [applyFontSize, clearTerminal, reconnectNow, toggleFullscreen],
  );

  const dispatchSessionMenu = useCallback(
    (action: SessionMenuAction) => {
      switch (action.type) {
        case "startFresh":
          startFreshSession();
          return;
        case "resumeLast":
          resumePreviousSession();
          return;
        case "attach":
          attachToSession(action.sessionId, action.mode);
          return;
        default:
          assertNever(action);
      }
    },
    [attachToSession, resumePreviousSession, startFreshSession],
  );

  const dispatchStatusBar = useCallback((action: StatusBarAction) => {
    switch (action.type) {
      case "toggleControls":
        setControlsOpen((previous) => !previous);
        return;
      case "toggleSessionMenu":
        setSessionMenuOpen((previous) => !previous);
        return;
      default:
        assertNever(action);
    }
  }, []);

  useEffect(() => {
    if (!documentRef) {
      return;
    }

    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(documentRef.fullscreenElement));
      if (!windowRef) {
        fitAndSyncSize();
        return;
      }

      windowRef.setTimeout(() => {
        fitAndSyncSize();
      }, 40);
    };

    documentRef.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      documentRef.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [documentRef, fitAndSyncSize, windowRef]);

  useEffect(() => {
    if (!sessionMenuOpen || !documentRef) {
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

    documentRef.addEventListener("mousedown", onPointerDown);
    documentRef.addEventListener("keydown", onKeyDown);
    return () => {
      documentRef.removeEventListener("mousedown", onPointerDown);
      documentRef.removeEventListener("keydown", onKeyDown);
    };
  }, [documentRef, sessionMenuOpen]);

  useEffect(() => {
    if (!sessionMenuOpen || !windowRef) {
      return;
    }

    void refreshLiveSessions();
    const timer = windowRef.setInterval(() => {
      void refreshLiveSessions();
    }, 4_000);

    return () => {
      windowRef.clearInterval(timer);
    };
  }, [refreshLiveSessions, sessionMenuOpen, windowRef]);

  useEffect(() => {
    if (!documentRef) {
      return;
    }

    const modeLabel = attachMode === "watch" ? "WATCH" : "LIVE";
    const statusText = statusLabel(status).toUpperCase();
    const idText = sessionId ? shortSessionId(sessionId) : "pending";
    documentRef.title = `${modeLabel} ${idText} ${statusText} · WooTTY`;
  }, [attachMode, documentRef, sessionId, status]);

  useEffect(() => {
    const terminalRoot = terminalElementRef.current;
    if (!terminalRoot) {
      return;
    }

    let cancelled = false;
    let disposeInput: TerminalRuntimeDisposable | null = null;

    const setup = async () => {
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
        fontSize: fontSizeRef.current,
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
        queueInput(data);
      });
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
  }, [documentRef, loadRuntime, queueInput]);

  useEffect(() => {
    if (!terminalReady || !windowRef || !documentRef) {
      return;
    }

    const terminalRoot = terminalElementRef.current;
    if (!terminalRoot) {
      return;
    }

    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        fitAndSyncSize();
      });
    });
    observer.observe(terminalRoot);

    const mediaQuery = windowRef.matchMedia(
      `(resolution: ${windowRef.devicePixelRatio}dppx)`,
    );
    mediaQuery.addEventListener("change", fitAndSyncSize);
    const removeMediaQueryListener = () => {
      mediaQuery.removeEventListener("change", fitAndSyncSize);
    };

    const visibilityHandler = () => {
      if (documentRef.visibilityState === "visible") {
        fitAndSyncSize();
      }
    };

    documentRef.addEventListener("visibilitychange", visibilityHandler);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      removeMediaQueryListener();
      documentRef.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [documentRef, fitAndSyncSize, terminalReady, windowRef]);

  useEffect(() => {
    if (!terminalReady || !windowRef) {
      return;
    }

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

    windowRef.addEventListener("keydown", keyHandler);
    return () => {
      windowRef.removeEventListener("keydown", keyHandler);
    };
  }, [
    applyFontSize,
    clearTerminal,
    reconnectNow,
    terminalReady,
    toggleFullscreen,
    windowRef,
  ]);

  useEffect(() => {
    if (!terminalReady) {
      return;
    }

    closedByUserRef.current = false;
    connect();

    return () => {
      closedByUserRef.current = true;
      clearTimers();

      const ws = wsRef.current;
      if (ws && ws.readyState < TRANSPORT_READY_STATE.CLOSING) {
        ws.close(1000, "component unmount");
      }
    };
  }, [clearTimers, connect, terminalReady]);

  const statusText = statusLabel(status);
  const sessionDisplay = sessionId ? shortSessionId(sessionId) : "pending";
  const { liveSessionCandidates, historySessionCandidates } =
    deriveSessionCandidates({
      liveSessions,
      currentSessionId: sessionId,
      sessionHistoryIds,
      lastSessionId,
    });
  const sessionMenuLiveRows = liveSessionCandidates.map((candidate) => {
    const row = presentSessionCandidate(candidate, ageLabel);
    return {
      id: row.id,
      mode: row.mode,
      primaryText: shortSessionId(row.id),
      secondaryText: row.secondaryText,
      actionLabel: row.actionLabel,
    };
  });
  const sessionMenuHistoryRows = historySessionCandidates.map((historyId) => ({
    id: historyId,
    primaryText: shortSessionId(historyId),
  }));
  const floatingControlsModel: FloatingControlsModel = {
    controlsOpen,
    terminalReady,
    fontSize,
    fontSizeMin: FONT_SIZE_MIN,
    fontSizeMax: FONT_SIZE_MAX,
    defaultFontSize: DEFAULT_FONT_SIZE,
    isFullscreen,
  };
  const sessionMenuModel: SessionMenuModel = {
    sessionMenuOpen,
    terminalReady,
    canResumeLast: lastSessionId.length > 0,
    sessionNotice,
    liveRows: sessionMenuLiveRows,
    historyRows: sessionMenuHistoryRows,
  };
  const tone = latencyTone(status, latencyMs);
  const statusBarModel: StatusBarModel = {
    controlsOpen,
    sessionMenuOpen,
    status,
    latencyTone: tone,
    statusText,
    latencyText: formatLatency(latencyMs),
    sessionDisplay,
    attachMode,
    reconnectAttempt,
    queuedInputText: formatBytes(queuedInputBytes),
    droppedInputText: formatBytes(droppedInputBytes),
    outputText: formatBytes(outputBytes),
    outputBytes,
    sessionButtonRef,
  };

  const modeLabel = attachMode === "watch" ? "Read-only watch" : "Control";
  const statusAnnouncement = terminalReady
    ? status === "reconnecting"
      ? `Reconnecting. Attempt ${reconnectAttempt}. ${lastSocketFailure || "Connection issue detected."}`
      : status === "error"
        ? `Connection error. ${lastSocketFailure || "Unable to maintain transport."}`
        : `Connection status ${statusText}. ${modeLabel} mode.`
    : "Loading terminal runtime.";

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
          model={floatingControlsModel}
          dispatch={dispatchFloatingControls}
        />

        {sessionMenuOpen && (
          <div className="session-popover-layer" ref={sessionMenuRef}>
            <SessionMenu
              model={sessionMenuModel}
              dispatch={dispatchSessionMenu}
            />
          </div>
        )}
      </section>

      <StatusBar model={statusBarModel} dispatch={dispatchStatusBar} />
    </main>
  );
}
