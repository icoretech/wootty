import type { TerminalBackendResolution } from "../contracts/backend-resolution";
import type { SessionsFetchResult } from "../contracts/session/sessions-fetch";
import type { StorageAccessResult } from "../contracts/storage-access";
import type { TerminalTransport } from "../contracts/transport/transport";
import type { Scheduler } from "../platform/scheduler";
import type { TerminalRuntime } from "../runtime/xterm-runtime-contract";

/**
 * Flattened environment type combining platform and domain concerns.
 * Previously split into TerminalPlatformEnvironment and TerminalDomainEnvironment,
 * but the separation added indirection without enabling polymorphism or testing benefits.
 */
export type TerminalAppEnvironment = {
  documentRef: Document | null;
  windowRef: Window | null;
  scheduler: Scheduler;
  bootstrapAuth?: () => Promise<void>;
  resolveBackendEndpoints: (
    windowRef: Window | null,
  ) => TerminalBackendResolution;
  fetchSessionsPayload: (
    sessionsHttpUrl: string,
    options?: {
      signal?: AbortSignal;
    },
  ) => Promise<SessionsFetchResult>;
  createTransport: (url: string) => TerminalTransport;
  loadRuntime: () => Promise<TerminalRuntime>;
  getLocalStorage: () => StorageAccessResult;
  getSessionStorage: () => StorageAccessResult;
};
