import { createXtermRuntimeProvider } from "../runtime/xterm-runtime";
import type { TerminalRuntime } from "../runtime/xterm-runtime-contract";

export function createRuntimeLoader(): () => Promise<TerminalRuntime> {
  const runtimeProviderRef: {
    current: ReturnType<typeof createXtermRuntimeProvider> | null;
  } = {
    current: null,
  };

  return () => {
    if (!runtimeProviderRef.current) {
      runtimeProviderRef.current = createXtermRuntimeProvider();
    }
    return runtimeProviderRef.current.load();
  };
}
