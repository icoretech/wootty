import type {
  SessionsFetchResult,
  TerminalAppEnvironment,
  TerminalBackendResolution,
  TerminalDomainEnvironment,
  TerminalPlatformEnvironment,
} from "../environment/terminal-environment-contract";
import { createBrowserTransport } from "../orchestration/browser-transport";
import { browserScheduler } from "../platform/scheduler";
import { TERMINAL_BACKEND_ROUTE } from "../protocol/generated-wire-contract";
import { createXtermRuntimeProvider } from "../runtime/xterm-runtime";

const ENV_SOCKET_URL = import.meta.env.VITE_WOOTTY_WS_URL as string | undefined;

function readStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function readDocument(): Document | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document;
}

function readWindow(): Window | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window;
}

function readAuthTokenFromWindow(windowRef: Window | null): string | undefined {
  if (!windowRef) {
    return undefined;
  }
  return normalizeAuthToken(
    windowRef.location.search
      ? new URLSearchParams(windowRef.location.search).get("token")
      : null,
  );
}

function normalizeAuthToken(
  token: string | null | undefined,
): string | undefined {
  if (!token) {
    return undefined;
  }
  const normalized = token.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readAuthTokenFromUrl(rawUrl: string): string | undefined {
  try {
    const parsed = new URL(rawUrl);
    return normalizeAuthToken(parsed.searchParams.get("token"));
  } catch {
    return undefined;
  }
}

function redactTokenInUrlForNotice(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.searchParams.has("token")) {
      parsed.searchParams.set("token", "[redacted]");
    }
    return parsed.toString();
  } catch {
    return rawUrl.replace(/([?&]token=)[^&]+/gi, "$1[redacted]");
  }
}

function createSessionFetchHeaders(authToken?: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const normalized = authToken?.trim();
  if (normalized) {
    headers.Authorization = `Bearer ${normalized}`;
  }
  return headers;
}

async function fetchSessionsFromEndpoint(
  sessionsHttpUrl: string,
  authToken?: string,
): Promise<SessionsFetchResult> {
  try {
    const response = await fetch(sessionsHttpUrl, {
      method: "GET",
      headers: createSessionFetchHeaders(authToken),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false as const,
        failure: {
          reason: "http_error" as const,
          status: response.status,
        },
      };
    }

    const body = await response.text();
    if (body.trim().length === 0) {
      return {
        ok: true as const,
        payload: null,
      };
    }

    try {
      return {
        ok: true as const,
        payload: JSON.parse(body) as unknown,
      };
    } catch (error: unknown) {
      return {
        ok: false as const,
        failure: {
          reason: "json_parse_error",
          cause: error,
        },
      };
    }
  } catch (error: unknown) {
    return {
      ok: false as const,
      failure: {
        reason: "network_error",
        cause: error,
      },
    };
  }
}

function resolveSessionUrlFromSocket(socketUrl: string): string | null {
  try {
    const parsedSocketUrl = new URL(socketUrl);
    if (
      parsedSocketUrl.protocol !== "ws:" &&
      parsedSocketUrl.protocol !== "wss:"
    ) {
      return null;
    }
    const httpProtocol =
      parsedSocketUrl.protocol === "wss:" ? "https:" : "http:";
    return `${httpProtocol}//${parsedSocketUrl.host}${TERMINAL_BACKEND_ROUTE.SESSIONS_HTTP}`;
  } catch {
    return null;
  }
}

function resolveSocketUrl(windowRef: Window | null, envUrl?: string): string {
  if (envUrl && envUrl.length > 0) {
    const configured = envUrl.trim();
    if (configured.startsWith("ws://") || configured.startsWith("wss://")) {
      return configured;
    }
    if (configured.startsWith("http://") || configured.startsWith("https://")) {
      try {
        const parsedHttpUrl = new URL(configured);
        const protocol = parsedHttpUrl.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${parsedHttpUrl.host}${parsedHttpUrl.pathname}${parsedHttpUrl.search}`;
      } catch {
        return configured;
      }
    }
    if (windowRef) {
      const protocol =
        windowRef.location.protocol === "https:" ? "wss:" : "ws:";
      const pathname = configured.startsWith("/")
        ? configured
        : `/${configured}`;
      return `${protocol}//${windowRef.location.host}${pathname}`;
    }
    return configured;
  }
  if (!windowRef) {
    return `ws://127.0.0.1${TERMINAL_BACKEND_ROUTE.TERMINAL_WS}`;
  }
  const protocol = windowRef.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${windowRef.location.host}${TERMINAL_BACKEND_ROUTE.TERMINAL_WS}`;
}

function withAuthQueryParam(socketUrl: string, authToken?: string): string {
  const normalized = authToken?.trim();
  if (!normalized) {
    return socketUrl;
  }
  try {
    const parsed = new URL(socketUrl);
    parsed.searchParams.set("token", normalized);
    return parsed.toString();
  } catch {
    return socketUrl;
  }
}

export function resolveTerminalBackendEndpoints(
  windowRef: Window | null,
  envSocketUrl?: string,
  authToken?: string,
): TerminalBackendResolution {
  const resolvedSocketUrl = resolveSocketUrl(windowRef, envSocketUrl);
  const resolvedAuthToken =
    normalizeAuthToken(authToken) ?? readAuthTokenFromUrl(resolvedSocketUrl);
  const terminalWsUrl = withAuthQueryParam(
    resolvedSocketUrl,
    resolvedAuthToken,
  );
  const sessionsHttpUrl = resolveSessionUrlFromSocket(terminalWsUrl);
  if (!sessionsHttpUrl) {
    const sourceLabel =
      envSocketUrl && envSocketUrl.length > 0
        ? "VITE_WOOTTY_WS_URL"
        : "derived browser endpoint";
    return {
      ok: false,
      issue: `${sourceLabel} produced an invalid websocket URL: ${redactTokenInUrlForNotice(terminalWsUrl)}`,
    };
  }
  return {
    ok: true,
    endpoints: {
      terminalWsUrl,
      sessionsHttpUrl,
    },
  };
}

function resolveEnvironmentAuthToken(): string | undefined {
  const windowRef = readWindow();
  return (
    readAuthTokenFromWindow(windowRef) ??
    readAuthTokenFromUrl(resolveSocketUrl(windowRef, ENV_SOCKET_URL))
  );
}

function resolveBackendEndpointsForBrowser(
  windowRef: Window | null,
): TerminalBackendResolution {
  return resolveTerminalBackendEndpoints(
    windowRef,
    ENV_SOCKET_URL,
    resolveEnvironmentAuthToken(),
  );
}

function fetchSessionsPayloadForBrowser(
  sessionsHttpUrl: string,
): Promise<SessionsFetchResult> {
  return fetchSessionsFromEndpoint(
    sessionsHttpUrl,
    resolveEnvironmentAuthToken(),
  );
}

export function createTerminalAppEnvironment(): TerminalAppEnvironment {
  const runtimeProviderRef: {
    current: ReturnType<typeof createXtermRuntimeProvider> | null;
  } = {
    current: null,
  };
  const loadRuntime = () => {
    if (!runtimeProviderRef.current) {
      runtimeProviderRef.current = createXtermRuntimeProvider();
    }
    return runtimeProviderRef.current.load();
  };
  const windowRef = readWindow();
  const documentRef = readDocument();

  const platform: TerminalPlatformEnvironment = {
    documentRef,
    windowRef,
    scheduler: browserScheduler,
    resolveBackendEndpoints: resolveBackendEndpointsForBrowser,
    fetchSessionsPayload: fetchSessionsPayloadForBrowser,
  };

  const domain: TerminalDomainEnvironment = {
    createTransport: createBrowserTransport,
    loadRuntime,
    getLocalStorage: () => readStorage("localStorage"),
    getSessionStorage: () => readStorage("sessionStorage"),
  };

  return {
    platform,
    domain,
  };
}
