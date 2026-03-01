import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTerminalPlatformContext } from "../../../src/features/terminal/app/composition/terminal-platform-composition";
import type { TerminalAppEnvironment } from "../../../src/features/terminal/environment/terminal-environment-contract";
import { browserScheduler } from "../../../src/features/terminal/platform/scheduler";
import type { SessionsFetchResult } from "../../../src/features/terminal/session/protocol/sessions-fetch-contract";

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
  fetchSessionsPayload: (
    url: string,
    options?: {
      signal?: AbortSignal;
    },
  ) => Promise<SessionsFetchResult>,
  backendResolution:
    | {
        ok: true;
        endpoints: {
          sessionsHttpUrl: string;
          terminalWsUrl: string;
        };
      }
    | {
        ok: false;
        issue: {
          code: string;
          details: string;
        };
      } = {
    ok: true,
    endpoints: {
      sessionsHttpUrl: "/api/sessions",
      terminalWsUrl: "ws://127.0.0.1/api/terminal",
    },
  },
): TerminalAppEnvironment {
  const storage = new Map<string, string>();
  return {
    platform: {
      resolveBackendEndpoints: () => backendResolution,
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
      getLocalStorage: () => ({
        storage: {
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
        } as Storage,
        error: null,
      }),
      getSessionStorage: () => ({ storage: null, error: null }),
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
      expect(fetchSessionsPayload).toHaveBeenCalledWith(
        "/api/sessions",
        undefined,
      );
    });
  });

  it("returns bootstrap errors without calling sessions fetch when endpoint resolution fails", async () => {
    const fetchSessionsPayload = vi.fn(async () => {
      return {
        ok: true,
        payload: {},
      } as const;
    });
    render(
      <PlatformProbe
        environment={createEnvironment(fetchSessionsPayload, {
          ok: false,
          issue: {
            code: "socket_url_invalid_format",
            details: "invalid endpoint",
          },
        })}
      />,
    );

    fireEvent.click(screen.getByTestId("fetch"));

    await waitFor(() => {
      expect(fetchSessionsPayload).not.toHaveBeenCalled();
    });
  });

  it("recomputes backend resolution on rerender to keep websocket auth in sync", () => {
    const fetchSessionsPayload = vi.fn(async () => {
      return {
        ok: true,
        payload: {},
      } as const;
    });
    let currentWsUrl = "ws://127.0.0.1/api/terminal?token=one";
    const environment = createEnvironment(fetchSessionsPayload);
    environment.platform.resolveBackendEndpoints = () => {
      return {
        ok: true,
        endpoints: {
          sessionsHttpUrl: "/api/sessions",
          terminalWsUrl: currentWsUrl,
        },
      };
    };

    const rendered = render(<PlatformProbe environment={environment} />);
    expect(screen.getByTestId("ws-url").textContent).toBe(
      "ws://127.0.0.1/api/terminal?token=one",
    );

    currentWsUrl = "ws://127.0.0.1/api/terminal?token=two";
    rendered.rerender(<PlatformProbe environment={environment} />);

    expect(screen.getByTestId("ws-url").textContent).toBe(
      "ws://127.0.0.1/api/terminal?token=two",
    );
  });
});
