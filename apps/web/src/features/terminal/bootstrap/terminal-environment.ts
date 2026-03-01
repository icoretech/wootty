import type {
  TerminalAppEnvironment,
  TerminalDomainEnvironment,
  TerminalPlatformEnvironment,
} from "../environment/terminal-environment-contract";
import { createBrowserTransport } from "../orchestration/browser-transport";
import { browserScheduler } from "../platform/scheduler";
import {
  type AuthTokenProvider,
  createBrowserAuthTokenProvider,
} from "./auth-token-provider";
import { resolveTerminalBackendEndpoints } from "./backend-endpoint-resolver";
import {
  readDocument,
  readStorage,
  readWindow,
} from "./browser-environment-access";
import { createRuntimeLoader } from "./runtime-loader";
import { createBrowserSessionsClient } from "./sessions-client";

type TerminalEnvironmentOptions = {
  socketUrl?: string;
};

function createPlatformEnvironment(
  authTokenProvider: AuthTokenProvider,
  envSocketUrl?: string,
): TerminalPlatformEnvironment {
  const windowRef = readWindow();
  return {
    documentRef: readDocument(),
    windowRef,
    scheduler: browserScheduler,
    resolveBackendEndpoints: (targetWindowRef) => {
      const tokenResolution = authTokenProvider();
      if (tokenResolution.issue) {
        return {
          ok: false as const,
          issue: tokenResolution.issue,
        };
      }
      return resolveTerminalBackendEndpoints(
        targetWindowRef,
        envSocketUrl,
        tokenResolution.token,
      );
    },
    fetchSessionsPayload: createBrowserSessionsClient(authTokenProvider),
  };
}

function createDomainEnvironment(): TerminalDomainEnvironment {
  const loadRuntime = createRuntimeLoader();
  return {
    createTransport: createBrowserTransport,
    loadRuntime,
    getLocalStorage: () => readStorage("localStorage"),
    getSessionStorage: () => readStorage("sessionStorage"),
  };
}

export function createTerminalAppEnvironment(
  options: TerminalEnvironmentOptions = {},
): TerminalAppEnvironment {
  const envSocketUrl =
    options.socketUrl ??
    (import.meta.env.VITE_WOOTTY_WS_URL as string | undefined);
  const authTokenProvider = createBrowserAuthTokenProvider(envSocketUrl);
  const platform = createPlatformEnvironment(authTokenProvider, envSocketUrl);
  const domain = createDomainEnvironment();
  return {
    platform,
    domain,
  };
}
