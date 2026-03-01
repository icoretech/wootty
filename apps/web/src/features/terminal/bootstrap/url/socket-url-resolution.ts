import type { TerminalBackendResolutionIssue } from "../../contracts/backend-resolution";
import { validateWebsocketEndpoint } from "../../contracts/websocket-endpoint-validation";
import { TERMINAL_BACKEND_ROUTE } from "../../protocol/generated-wire-contract";
import { createBackendResolutionIssue } from "./backend-resolution-issue";
import { redactTokenInUrlForNotice } from "./redact-token-in-url";

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
    return {
      ok: true,
      socketUrl: `${protocol}//${parsedHttpUrl.host}${parsedHttpUrl.pathname}${parsedHttpUrl.search}`,
    };
  } catch {
    return {
      ok: false,
      issue: invalidFormatIssue(configured),
    };
  }
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
  const pathname = configured.startsWith("/") ? configured : `/${configured}`;
  return {
    ok: true,
    socketUrl: `${protocol}//${windowRef.location.host}${pathname}`,
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
