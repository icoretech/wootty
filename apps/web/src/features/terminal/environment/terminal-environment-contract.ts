import type { TerminalBackendResolution } from "../contracts/backend-resolution";
import type { SessionsFetchResult } from "../contracts/session/sessions-fetch";
import type { StorageAccessResult } from "../contracts/storage-access";
import type { TerminalTransport } from "../contracts/transport/transport";
import type { Scheduler } from "../platform/scheduler";
import type { TerminalRuntime } from "../runtime/xterm-runtime-contract";

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
  getLocalStorage: () => StorageAccessResult;
  getSessionStorage: () => StorageAccessResult;
};

export type TerminalAppEnvironment = {
  platform: TerminalPlatformEnvironment;
  domain: TerminalDomainEnvironment;
};
