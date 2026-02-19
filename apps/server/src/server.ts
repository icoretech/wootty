import fs from "node:fs";
import path from "node:path";

import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import type WebSocket from "ws";
import type { RawData } from "ws";

import type { RuntimeConfig } from "./config";
import { FakeTerminalFactory } from "./fake-pty-factory";
import { NodePtyFactory } from "./node-pty-factory";
import { parseClientMessage, type ServerMessage } from "./protocol";
import { SessionManager } from "./session-manager";
import type { TerminalFactory } from "./terminal-process";

export interface BuildServerOptions {
  config: RuntimeConfig;
  terminalFactory?: TerminalFactory;
  staticDir?: string;
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== 1) {
    return;
  }

  socket.send(JSON.stringify(message));
}

export async function buildServer(options: BuildServerOptions) {
  const app = Fastify({
    logger: true,
  });

  await app.register(websocket);

  const defaultTerminalFactory =
    process.env.WOOTTY_FAKE_PTY === "1"
      ? new FakeTerminalFactory()
      : new NodePtyFactory();
  const terminalFactory = options.terminalFactory ?? defaultTerminalFactory;
  const sessionManager = new SessionManager({
    reconnectGraceMs: options.config.reconnectGraceMs,
    historyBytes: options.config.historyBytes,
    terminalFactory,
    createOptions: {
      command: options.config.command,
      args: options.config.args,
      cwd: options.config.cwd,
      env: options.config.env,
    },
  });

  const defaultStaticDir = path.resolve(__dirname, "../../web/dist");
  const staticDir = options.staticDir ?? defaultStaticDir;

  if (fs.existsSync(staticDir)) {
    await app.register(fastifyStatic, {
      root: staticDir,
      prefix: "/",
      decorateReply: true,
    });
  }

  app.get("/api/health", async () => ({
    ok: true,
  }));

  app.get("/api/terminal", { websocket: true }, (socket: WebSocket) => {
    let activeSessionId: string | null = null;

    socket.on("message", (rawData: RawData) => {
      const raw = rawData.toString();
      const message = parseClientMessage(raw);

      if (!message) {
        send(socket, { type: "error", message: "Invalid message" });
        return;
      }

      if (message.type === "attach") {
        try {
          const result = sessionManager.attach(
            message.sessionId,
            socket,
            message.cols,
            message.rows,
          );
          activeSessionId = result.sessionId;

          send(socket, { type: "ready", sessionId: result.sessionId });
          if (result.history.length > 0) {
            send(socket, { type: "output", data: result.history });
          }
          if (result.exitInfo) {
            send(socket, { type: "exit", ...result.exitInfo });
          }
        } catch (error) {
          const messageText =
            error instanceof Error
              ? error.message
              : "Failed to start terminal session";
          app.log.error({ err: error }, "failed to attach terminal session");
          send(socket, {
            type: "error",
            message: `Terminal attach failed: ${messageText}`,
          });
          return;
        }
        return;
      }

      if (!activeSessionId) {
        send(socket, { type: "error", message: "Attach first" });
        return;
      }

      if (message.type === "input") {
        const ok = sessionManager.write(activeSessionId, message.data);
        if (!ok) {
          send(socket, { type: "error", message: "Session is not writable" });
        }
        return;
      }

      if (message.type === "resize") {
        const ok = sessionManager.resize(
          activeSessionId,
          message.cols,
          message.rows,
        );
        if (!ok) {
          send(socket, { type: "error", message: "Session is not resizable" });
        }
        return;
      }

      if (message.type === "ping") {
        send(socket, { type: "pong" });
      }
    });

    socket.on("close", () => {
      if (activeSessionId) {
        sessionManager.detach(activeSessionId, socket);
      }
    });

    socket.on("error", (error: Error) => {
      app.log.warn({ err: error }, "websocket error");
    });
  });

  if (fs.existsSync(staticDir)) {
    app.setNotFoundHandler((request, reply) => {
      if (
        request.raw.method === "GET" &&
        !request.raw.url?.startsWith("/api/")
      ) {
        return reply.sendFile("index.html");
      }

      return reply.code(404).send({ error: "Not Found" });
    });
  } else {
    app.get("/", async () => ({
      ok: true,
      service: "wootty-server",
      message:
        "Web app is not built yet. Run `pnpm --filter @icoretech/wootty-web build`.",
    }));
  }

  app.addHook("onClose", async () => {
    sessionManager.shutdown();
  });

  return app;
}

export async function startServer(config: RuntimeConfig): Promise<void> {
  const app = await buildServer({ config });

  await app.listen({
    host: config.host,
    port: config.port,
  });

  app.log.info(
    {
      host: config.host,
      port: config.port,
      command: [config.command, ...config.args].join(" "),
    },
    "WooTTY server started",
  );
}
