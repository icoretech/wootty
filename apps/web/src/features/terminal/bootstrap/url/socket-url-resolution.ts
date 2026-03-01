import type { TerminalBackendResolutionIssue } from "../../contracts/backend-resolution";
import { TERMINAL_BACKEND_ROUTE } from "../../protocol/generated-wire-contract";
import { redactTokenInUrlForNotice } from "../../shared/sanitization/redact-token-in-url";
import { validateWebsocketEndpoint } from "../../validation/websocket-endpoint";
import { createBackendResolutionIssue } from "./backend-resolution-issue";

type SocketUrlResolutionResult =
  | {
      ok: true;
      socketUrl: string;
    }
  | {
      ok: false;
      issue: TerminalBackendResolutionIssue;
    };

function unsupportedProtocolIssue(
  configured: string,
): TerminalBackendResolutionIssue {
  return createBackendResolutionIssue(
    "env_socket_url_unsupported_protocol",
    `VITE_WOOTTY_WS_URL uses an unsupported protocol: ${redactTokenInUrlForNotice(configured)}`,
  );
}

function invalidFormatIssue(
  configured: string,
): TerminalBackendResolutionIssue {
  return createBackendResolutionIssue(
    "env_socket_url_invalid_format",
    `VITE_WOOTTY_WS_URL is not a valid URL: ${redactTokenInUrlForNotice(configured)}`,
  );
}

function resolveAbsoluteWsSocketUrl(
  configured: string,
): SocketUrlResolutionResult {
  const validated = validateWebsocketEndpoint(configured);
  if (!validated.ok) {
    const issue =
      validated.reason === "unsupported_protocol"
        ? unsupportedProtocolIssue(configured)
        : invalidFormatIssue(configured);
    return {
      ok: false,
      issue,
    };
  }
  return {
    ok: true,
    socketUrl: validated.endpoint,
  };
}

function resolveAbsoluteHttpSocketUrl(
  configured: string,
): SocketUrlResolutionResult {
  try {
    const parsedHttpUrl = new URL(configured);
    const protocol = parsedHttpUrl.protocol === "https:" ? "wss:" : "ws:";
    const terminalPath = deriveTerminalPathFromHttpUrl(parsedHttpUrl.pathname);
    return {
      ok: true,
      socketUrl: `${protocol}//${parsedHttpUrl.host}${terminalPath}${parsedHttpUrl.search}`,
    };
  } catch {
    return {
      ok: false,
      issue: invalidFormatIssue(configured),
    };
  }
}

function deriveTerminalPathFromHttpUrl(pathname: string): string {
  const normalizedPath =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  if (normalizedPath.endsWith(TERMINAL_BACKEND_ROUTE.TERMINAL_WS)) {
    return normalizedPath;
  }
  if (normalizedPath.endsWith(TERMINAL_BACKEND_ROUTE.SESSIONS_HTTP)) {
    return `${normalizedPath.slice(
      0,
      -TERMINAL_BACKEND_ROUTE.SESSIONS_HTTP.length,
    )}${TERMINAL_BACKEND_ROUTE.TERMINAL_WS}`;
  }
  if (normalizedPath === "" || normalizedPath === "/") {
    return TERMINAL_BACKEND_ROUTE.TERMINAL_WS;
  }
  return `${normalizedPath}${TERMINAL_BACKEND_ROUTE.TERMINAL_WS}`;
}

function resolveRelativeSocketUrl(
  windowRef: Window | null,
  configured: string,
): SocketUrlResolutionResult {
  if (!windowRef) {
    return {
      ok: false,
      issue: createBackendResolutionIssue(
        "env_socket_url_requires_window_host",
        "VITE_WOOTTY_WS_URL requires a browser host to resolve relative path values.",
      ),
    };
  }

  const protocol = windowRef.location.protocol === "https:" ? "wss:" : "ws:";
  const candidatePath = configured.startsWith("/")
    ? configured
    : `/${configured}`;
  let parsedRelative: URL;
  try {
    parsedRelative = new URL(
      candidatePath,
      `${windowRef.location.protocol}//${windowRef.location.host}`,
    );
  } catch {
    return {
      ok: false,
      issue: invalidFormatIssue(configured),
    };
  }
  const terminalPath = deriveTerminalPathFromHttpUrl(parsedRelative.pathname);
  return {
    ok: true,
    socketUrl: `${protocol}//${windowRef.location.host}${terminalPath}${parsedRelative.search}`,
  };
}

function defaultSocketUrl(windowRef: Window | null): string {
  if (!windowRef) {
    return `ws://127.0.0.1${TERMINAL_BACKEND_ROUTE.TERMINAL_WS}`;
  }
  const protocol = windowRef.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${windowRef.location.host}${TERMINAL_BACKEND_ROUTE.TERMINAL_WS}`;
}

export function resolveSocketUrl(
  windowRef: Window | null,
  envUrl?: string,
): SocketUrlResolutionResult {
  const configured = envUrl?.trim();
  if (!configured) {
    return {
      ok: true,
      socketUrl: defaultSocketUrl(windowRef),
    };
  }

  if (configured.startsWith("ws://") || configured.startsWith("wss://")) {
    return resolveAbsoluteWsSocketUrl(configured);
  }
  if (configured.startsWith("http://") || configured.startsWith("https://")) {
    return resolveAbsoluteHttpSocketUrl(configured);
  }
  if (configured.includes("://")) {
    return {
      ok: false,
      issue: unsupportedProtocolIssue(configured),
    };
  }

  return resolveRelativeSocketUrl(windowRef, configured);
}
