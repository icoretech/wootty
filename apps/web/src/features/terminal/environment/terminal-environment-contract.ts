import type { TerminalTransport } from "../contracts/transport";
import type { Scheduler } from "../platform/scheduler";
import type { TerminalRuntime } from "../runtime/xterm-runtime-contract";

export type TerminalBackendEndpoints = {
  sessionsHttpUrl: string;
  terminalWsUrl: string;
};

export type SessionsFetchFailure =
  | {
      reason: "http_error";
      status: number;
    }
  | {
      reason: "bootstrap_error";
      issue: string;
    }
  | {
      reason: "json_parse_error";
      cause: unknown;
    }
  | {
      reason: "network_error";
      cause: unknown;
    };

export type SessionsFetchResult =
  | {
      ok: true;
      payload: unknown;
    }
  | {
      ok: false;
      failure: SessionsFetchFailure;
    };

export type TerminalBackendResolution =
  | {
      ok: true;
      endpoints: TerminalBackendEndpoints;
    }
  | {
      ok: false;
      issue: string;
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
