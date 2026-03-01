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

const ENV_SOCKET_URL = import.meta.env.VITE_WOOTTY_WS_URL as string | undefined;

function createPlatformEnvironment(
  authTokenProvider: AuthTokenProvider,
): TerminalPlatformEnvironment {
  const windowRef = readWindow();
  return {
    documentRef: readDocument(),
    windowRef,
    scheduler: browserScheduler,
    resolveBackendEndpoints: (targetWindowRef) =>
      resolveTerminalBackendEndpoints(
        targetWindowRef,
        ENV_SOCKET_URL,
        authTokenProvider().token,
      ),
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

export function createTerminalAppEnvironment(): TerminalAppEnvironment {
  const authTokenProvider = createBrowserAuthTokenProvider(ENV_SOCKET_URL);
  const platform = createPlatformEnvironment(authTokenProvider);
  const domain = createDomainEnvironment();
  return {
    platform,
    domain,
  };
}
