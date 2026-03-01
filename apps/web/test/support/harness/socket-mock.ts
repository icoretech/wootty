import type { TerminalTransport } from "../../../src/features/terminal/contracts/transport";
import { createBrowserTransport } from "../../../src/features/terminal/orchestration/browser-transport";
import {
  type BrowserSocketMock,
  createBrowserSocketMockHarness,
} from "./browser-socket-mock";
import type { TerminalTransportBoundary } from "./terminal-boundary";

export type WebSocketMock = BrowserSocketMock;

export type WebSocketMockHarness = {
  readonly instances: WebSocketMock[];
  createTransport: (url: string) => TerminalTransport;
  reset: () => void;
  sentMessages: (ws: WebSocketMock) => Array<Record<string, unknown>>;
} & TerminalTransportBoundary;

function parseSentMessage(entry: string): Record<string, unknown> {
  return JSON.parse(entry) as Record<string, unknown>;
}

class WebSocketMockHarnessImpl implements WebSocketMockHarness {
  private readonly socketHarness = createBrowserSocketMockHarness();

  get instances(): WebSocketMock[] {
    return this.socketHarness.instances;
  }

  createTransport = (url: string): TerminalTransport => {
    return createBrowserTransport(url, this.socketHarness.createSocket);
  };

  reset = (): void => {
    this.socketHarness.reset();
  };

  sentMessages = (ws: WebSocketMock): Array<Record<string, unknown>> => {
    return ws.sent.map(parseSentMessage);
  };
}

export function createWebSocketMockHarness(): WebSocketMockHarness {
  return new WebSocketMockHarnessImpl();
}
