import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTerminalPlatformContext } from "../../../src/features/terminal/app/composition/terminal-platform-composition";
import type {
  SessionsFetchResult,
  TerminalAppEnvironment,
} from "../../../src/features/terminal/environment/terminal-environment-contract";
import { browserScheduler } from "../../../src/features/terminal/platform/scheduler";

type PlatformProbeProps = {
  environment: TerminalAppEnvironment;
};

function PlatformProbe({ environment }: PlatformProbeProps) {
  const platform = useTerminalPlatformContext(environment.platform);
  const wsUrl = platform.backendResolution.ok
    ? platform.backendResolution.endpoints.terminalWsUrl
    : "invalid";
  return (
    <section>
      <output data-testid="ws-url">{wsUrl}</output>
      <button
        type="button"
        data-testid="fetch"
        onClick={() => {
          void platform.fetchSessions();
        }}
      >
        fetch
      </button>
    </section>
  );
}

function createEnvironment(
  fetchSessionsPayload: (url: string) => Promise<SessionsFetchResult>,
): TerminalAppEnvironment {
  const storage = new Map<string, string>();
  return {
    platform: {
      resolveBackendEndpoints: () => ({
        ok: true,
        endpoints: {
          sessionsHttpUrl: "/api/sessions",
          terminalWsUrl: "ws://127.0.0.1/api/terminal",
        },
      }),
      fetchSessionsPayload,
      documentRef: document,
      windowRef: window,
      scheduler: browserScheduler,
    },
    domain: {
      createTransport: () => {
        throw new Error("not used");
      },
      loadRuntime: async () => {
        throw new Error("not used");
      },
      getLocalStorage: () =>
        ({
          get length() {
            return storage.size;
          },
          clear() {
            storage.clear();
          },
          getItem(key: string) {
            return storage.get(key) ?? null;
          },
          key(index: number) {
            return Array.from(storage.keys())[index] ?? null;
          },
          removeItem(key: string) {
            storage.delete(key);
          },
          setItem(key: string, value: string) {
            storage.set(key, value);
          },
        }) as Storage,
      getSessionStorage: () => null,
    },
  };
}

describe("terminal platform composition", () => {
  it("resolves backend endpoints and delegates session fetches", async () => {
    const fetchSessionsPayload = vi.fn(async () => {
      return {
        ok: true,
        payload: {},
      } as const;
    });
    render(
      <PlatformProbe environment={createEnvironment(fetchSessionsPayload)} />,
    );

    expect(screen.getByTestId("ws-url").textContent).toBe(
      "ws://127.0.0.1/api/terminal",
    );

    fireEvent.click(screen.getByTestId("fetch"));

    await waitFor(() => {
      expect(fetchSessionsPayload).toHaveBeenCalledWith("/api/sessions");
    });
  });
});
