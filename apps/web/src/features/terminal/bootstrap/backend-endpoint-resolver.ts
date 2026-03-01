import { TERMINAL_BACKEND_ROUTE } from "../protocol/generated-wire-contract";
import { TERMINAL_AUTH_POLICY } from "./auth-policy";
import type {
  TerminalBackendResolution,
  TerminalBackendResolutionIssue,
} from "./backend-resolution-contract";

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

function toIssue(
  code: TerminalBackendResolutionIssue["code"],
  details: string,
): TerminalBackendResolutionIssue {
  return {
    code,
    details,
  };
}

type SocketUrlResolutionResult =
  | {
      ok: true;
      socketUrl: string;
    }
  | {
      ok: false;
      issue: TerminalBackendResolutionIssue;
    };

function resolveSessionUrlFromSocket(
  socketUrl: string,
): { ok: true; sessionsHttpUrl: string } | { ok: false; issue: string } {
  try {
    const parsedSocketUrl = new URL(socketUrl);
    if (
      parsedSocketUrl.protocol !== "ws:" &&
      parsedSocketUrl.protocol !== "wss:"
    ) {
      return {
        ok: false,
        issue: `unsupported websocket protocol (${parsedSocketUrl.protocol})`,
      };
    }
    const httpProtocol =
      parsedSocketUrl.protocol === "wss:" ? "https:" : "http:";
    const sessionsPath = deriveSessionsPath(parsedSocketUrl.pathname);
    return {
      ok: true,
      sessionsHttpUrl: `${httpProtocol}//${parsedSocketUrl.host}${sessionsPath}`,
    };
  } catch {
    return {
      ok: false,
      issue: "invalid websocket URL format",
    };
  }
}

function deriveSessionsPath(socketPathname: string): string {
  if (socketPathname.endsWith(TERMINAL_BACKEND_ROUTE.TERMINAL_WS)) {
    return `${socketPathname.slice(
      0,
      -TERMINAL_BACKEND_ROUTE.TERMINAL_WS.length,
    )}${TERMINAL_BACKEND_ROUTE.SESSIONS_HTTP}`;
  }
  if (socketPathname.endsWith("/terminal")) {
    return `${socketPathname.slice(0, -"/terminal".length)}/sessions`;
  }
  return TERMINAL_BACKEND_ROUTE.SESSIONS_HTTP;
}

export function resolveSocketUrl(
  windowRef: Window | null,
  envUrl?: string,
): SocketUrlResolutionResult {
  if (envUrl && envUrl.length > 0) {
    const configured = envUrl.trim();
    if (configured.startsWith("ws://") || configured.startsWith("wss://")) {
      return {
        ok: true,
        socketUrl: configured,
      };
    }
    if (configured.startsWith("http://") || configured.startsWith("https://")) {
      try {
        const parsedHttpUrl = new URL(configured);
        const protocol = parsedHttpUrl.protocol === "https:" ? "wss:" : "ws:";
        return {
          ok: true,
          socketUrl: `${protocol}//${parsedHttpUrl.host}${parsedHttpUrl.pathname}${parsedHttpUrl.search}`,
        };
      } catch {
        return {
          ok: false,
          issue: toIssue(
            "env_socket_url_invalid_format",
            `VITE_WOOTTY_WS_URL is not a valid URL: ${redactTokenInUrlForNotice(configured)}`,
          ),
        };
      }
    }
    if (configured.includes("://")) {
      return {
        ok: false,
        issue: toIssue(
          "env_socket_url_unsupported_protocol",
          `VITE_WOOTTY_WS_URL uses an unsupported protocol: ${redactTokenInUrlForNotice(configured)}`,
        ),
      };
    }
    if (windowRef) {
      const protocol =
        windowRef.location.protocol === "https:" ? "wss:" : "ws:";
      const pathname = configured.startsWith("/")
        ? configured
        : `/${configured}`;
      return {
        ok: true,
        socketUrl: `${protocol}//${windowRef.location.host}${pathname}`,
      };
    }
    return {
      ok: false,
      issue: toIssue(
        "env_socket_url_requires_window_host",
        "VITE_WOOTTY_WS_URL requires a browser host to resolve relative path values.",
      ),
    };
  }
  if (!windowRef) {
    return {
      ok: true,
      socketUrl: `ws://127.0.0.1${TERMINAL_BACKEND_ROUTE.TERMINAL_WS}`,
    };
  }
  const protocol = windowRef.location.protocol === "https:" ? "wss:" : "ws:";
  return {
    ok: true,
    socketUrl: `${protocol}//${windowRef.location.host}${TERMINAL_BACKEND_ROUTE.TERMINAL_WS}`,
  };
}

function withAuthQueryParam(socketUrl: string, authToken?: string): string {
  if (TERMINAL_AUTH_POLICY.websocket !== "query_token") {
    return socketUrl;
  }
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
  const socketResolution = resolveSocketUrl(windowRef, envSocketUrl);
  if (!socketResolution.ok) {
    return {
      ok: false,
      issue: socketResolution.issue,
    };
  }

  const terminalWsUrl = withAuthQueryParam(
    socketResolution.socketUrl,
    authToken,
  );
  const sessionsResolution = resolveSessionUrlFromSocket(terminalWsUrl);
  if (!sessionsResolution.ok) {
    const issueCode =
      sessionsResolution.issue === "invalid websocket URL format"
        ? "socket_url_invalid_format"
        : "socket_url_unsupported_protocol";
    return {
      ok: false,
      issue: toIssue(
        issueCode,
        `Derived websocket endpoint is invalid: ${redactTokenInUrlForNotice(terminalWsUrl)} (${sessionsResolution.issue})`,
      ),
    };
  }

  return {
    ok: true,
    endpoints: {
      terminalWsUrl,
      sessionsHttpUrl: sessionsResolution.sessionsHttpUrl,
    },
  };
}
