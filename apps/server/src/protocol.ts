import { z } from "zod";

const dimensionSchema = z.number().int().min(1).max(2000);

const attachMessageSchema = z.object({
  type: z.literal("attach"),
  sessionId: z.string().min(1).optional(),
  cols: dimensionSchema,
  rows: dimensionSchema,
});

const inputMessageSchema = z.object({
  type: z.literal("input"),
  data: z.string(),
});

const resizeMessageSchema = z.object({
  type: z.literal("resize"),
  cols: dimensionSchema,
  rows: dimensionSchema,
});

const pingMessageSchema = z.object({
  type: z.literal("ping"),
});

const clientMessageSchema = z.discriminatedUnion("type", [
  attachMessageSchema,
  inputMessageSchema,
  resizeMessageSchema,
  pingMessageSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type AttachMessage = z.infer<typeof attachMessageSchema>;

export interface ServerReadyMessage {
  type: "ready";
  sessionId: string;
}

export interface ServerOutputMessage {
  type: "output";
  data: string;
}

export interface ServerExitMessage {
  type: "exit";
  code: number;
  signal: number;
}

export interface ServerErrorMessage {
  type: "error";
  message: string;
}

export interface ServerPongMessage {
  type: "pong";
}

export type ServerMessage =
  | ServerReadyMessage
  | ServerOutputMessage
  | ServerExitMessage
  | ServerErrorMessage
  | ServerPongMessage;

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}
