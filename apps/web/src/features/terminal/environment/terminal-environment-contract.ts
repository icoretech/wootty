import type { TerminalBackendResolution } from "../bootstrap/backend-resolution-contract";
import type { TerminalTransport } from "../contracts/transport";
import type { Scheduler } from "../platform/scheduler";
import type { TerminalRuntime } from "../runtime/xterm-runtime-contract";
import type { SessionsFetchResult } from "../session/protocol/sessions-fetch-contract";

export type TerminalPlatformEnvironment = {
  documentRef: Document | null;
  windowRef: Window | null;
  scheduler: Scheduler;
  resolveBackendEndpoints: (
    windowRef: Window | null,
  ) => TerminalBackendResolution;
  fetchSessionsPayload: (
    sessionsHttpUrl: string,
    options?: {
      signal?: AbortSignal;
    },
  ) => Promise<SessionsFetchResult>;
};

export type TerminalDomainEnvironment = {
  createTransport: (url: string) => TerminalTransport;
  loadRuntime: () => Promise<TerminalRuntime>;
  getLocalStorage: () => Storage | null;
  getSessionStorage: () => Storage | null;
};

export type TerminalAppEnvironment = {
  platform: TerminalPlatformEnvironment;
  domain: TerminalDomainEnvironment;
};
