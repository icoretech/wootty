import { randomUUID } from "node:crypto";

import type WebSocket from "ws";

import { HistoryBuffer } from "./history-buffer";
import type {
  TerminalCreateOptions,
  TerminalExit,
  TerminalFactory,
  TerminalProcess,
} from "./terminal-process";

interface Session {
  id: string;
  terminal: TerminalProcess;
  history: HistoryBuffer;
  socket: WebSocket | null;
  reconnectTimer: NodeJS.Timeout | null;
  exitInfo: TerminalExit | null;
  disposers: Array<() => void>;
}

export interface SessionManagerOptions {
  reconnectGraceMs: number;
  historyBytes: number;
  terminalFactory: TerminalFactory;
  createOptions: Omit<TerminalCreateOptions, "cols" | "rows">;
}

export interface AttachResult {
  sessionId: string;
  history: string;
  exitInfo: TerminalExit | null;
  created: boolean;
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly options: SessionManagerOptions) {}

  attach(
    sessionId: string | undefined,
    socket: WebSocket,
    cols: number,
    rows: number,
  ): AttachResult {
    const existing = sessionId ? this.sessions.get(sessionId) : undefined;

    if (existing) {
      if (existing.reconnectTimer) {
        clearTimeout(existing.reconnectTimer);
        existing.reconnectTimer = null;
      }

      if (
        existing.socket &&
        existing.socket !== socket &&
        existing.socket.readyState < 2
      ) {
        existing.socket.close(1012, "replaced by newer connection");
      }

      existing.socket = socket;
      existing.terminal.resize(cols, rows);

      return {
        sessionId: existing.id,
        history: existing.history.dump(),
        exitInfo: existing.exitInfo,
        created: false,
      };
    }

    const id = randomUUID();
    const terminal = this.options.terminalFactory.create({
      ...this.options.createOptions,
      cols,
      rows,
    });

    const session: Session = {
      id,
      terminal,
      history: new HistoryBuffer(this.options.historyBytes),
      socket,
      reconnectTimer: null,
      exitInfo: null,
      disposers: [],
    };

    session.disposers.push(
      terminal.onData((data) => {
        session.history.append(data);
        if (session.socket && session.socket.readyState === 1) {
          session.socket.send(JSON.stringify({ type: "output", data }));
        }
      }),
    );

    session.disposers.push(
      terminal.onExit((exitInfo) => {
        session.exitInfo = exitInfo;
        if (session.socket && session.socket.readyState === 1) {
          session.socket.send(JSON.stringify({ type: "exit", ...exitInfo }));
        }
        this.scheduleCleanup(session.id, 1);
      }),
    );

    this.sessions.set(id, session);

    return {
      sessionId: id,
      history: "",
      exitInfo: null,
      created: true,
    };
  }

  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.exitInfo) {
      return false;
    }
    session.terminal.write(data);
    return true;
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.exitInfo) {
      return false;
    }
    session.terminal.resize(cols, rows);
    return true;
  }

  detach(sessionId: string, socket: WebSocket): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.socket === socket) {
      session.socket = null;
    }

    if (session.exitInfo) {
      this.scheduleCleanup(sessionId, 1);
      return;
    }

    this.scheduleCleanup(sessionId, this.options.reconnectGraceMs);
  }

  shutdown(): void {
    for (const session of this.sessions.values()) {
      if (session.reconnectTimer) {
        clearTimeout(session.reconnectTimer);
      }
      session.terminal.kill("SIGTERM");
      for (const dispose of session.disposers) {
        dispose();
      }
    }
    this.sessions.clear();
  }

  private scheduleCleanup(sessionId: string, delayMs: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
    }

    session.reconnectTimer = setTimeout(() => {
      this.cleanupSession(sessionId);
    }, delayMs);
  }

  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (!session.exitInfo) {
      session.terminal.kill("SIGTERM");
    }

    for (const dispose of session.disposers) {
      dispose();
    }

    this.sessions.delete(sessionId);
  }
}
