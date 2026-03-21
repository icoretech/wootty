import { TERMINAL_BACKEND_ROUTE } from "../protocol/generated-wire-contract";
import { resolveBrowserBackendEndpoints } from "./resolution/bootstrap-context";

const AUTH_BOOTSTRAP_HTTP_ROUTE = "/api/auth/bootstrap";

function normalizeAuthToken(
  token: string | null | undefined,
): string | undefined {
  if (!token) {
    return undefined;
  }
  const normalized = token.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function readAuthTokenFromWindowHash(
  windowRef: Window | null,
): string | undefined {
  if (!windowRef) {
    return undefined;
  }
  const rawHash = windowRef.location.hash.startsWith("#")
    ? windowRef.location.hash.slice(1)
    : windowRef.location.hash;
  if (rawHash.length === 0) {
    return undefined;
  }
  return normalizeAuthToken(new URLSearchParams(rawHash).get("token"));
}

function stripAuthTokenFromWindowHash(windowRef: Window): void {
  const rawHash = windowRef.location.hash.startsWith("#")
    ? windowRef.location.hash.slice(1)
    : windowRef.location.hash;
  if (rawHash.length === 0) {
    return;
  }
  const params = new URLSearchParams(rawHash);
  if (!params.has("token")) {
    return;
  }
  params.delete("token");
  const nextHash = params.toString();
  const nextUrl = `${windowRef.location.pathname}${windowRef.location.search}${
    nextHash.length > 0 ? `#${nextHash}` : ""
  }`;
  windowRef.history.replaceState({}, "", nextUrl);
}

export function deriveAuthBootstrapUrlFromSessions(
  sessionsHttpUrl: string,
): string {
  const parsed = new URL(sessionsHttpUrl);
  if (parsed.pathname.endsWith(TERMINAL_BACKEND_ROUTE.SESSIONS_HTTP)) {
    parsed.pathname = `${parsed.pathname.slice(
      0,
      -TERMINAL_BACKEND_ROUTE.SESSIONS_HTTP.length,
    )}${AUTH_BOOTSTRAP_HTTP_ROUTE}`;
  } else {
    parsed.pathname = AUTH_BOOTSTRAP_HTTP_ROUTE;
  }
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export async function bootstrapBrowserAuth(
  windowRef: Window | null,
  envSocketUrl?: string,
): Promise<void> {
  const token = readAuthTokenFromWindowHash(windowRef);
  if (!windowRef || !token) {
    return;
  }

  const backendResolution = resolveBrowserBackendEndpoints(
    windowRef,
    envSocketUrl,
  );
  if (!backendResolution.ok) {
    throw new Error(
      `terminal auth bootstrap failed: ${backendResolution.issue.details}`,
    );
  }

  const response = await fetch(
    deriveAuthBootstrapUrlFromSessions(
      backendResolution.endpoints.sessionsHttpUrl,
    ),
    {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `terminal auth bootstrap failed with status ${response.status}`,
    );
  }

  stripAuthTokenFromWindowHash(windowRef);
}
