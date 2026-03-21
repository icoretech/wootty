import type { TerminalBackendResolution } from "../../contracts/backend-resolution";
import { resolveTerminalBackendEndpoints } from "../backend-endpoint-resolver";

export function resolveBrowserBackendEndpoints(
  windowRef: Window | null,
  envSocketUrl?: string,
): TerminalBackendResolution {
  return resolveTerminalBackendEndpoints(windowRef, envSocketUrl);
}
