import type { TerminalBackendResolution } from "../contracts/backend-resolution";
import type { TerminalTransport } from "../contracts/transport";
import type { Scheduler } from "../platform/scheduler";
import type { TerminalRuntime } from "../runtime/xterm-runtime-contract";
import type { StorageAccessFailure } from "../session/persistence/session-storage";
import type { SessionsFetchResult } from "../session/protocol/sessions-fetch-contract";

export type TerminalStorageAccessResult = {
  storage: Storage | null;
  error: StorageAccessFailure | null;
};

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
  getLocalStorage: () => TerminalStorageAccessResult;
  getSessionStorage: () => TerminalStorageAccessResult;
};

export type TerminalAppEnvironment = {
  platform: TerminalPlatformEnvironment;
  domain: TerminalDomainEnvironment;
};
