import { vi } from "vitest";

export type SessionsResponseInit = {
  ok?: boolean;
  status?: number;
  sessions?: unknown[];
};

type FetchHarness = {
  readonly fetchMock: ReturnType<typeof vi.fn>;
  setFetchResponse: (init: SessionsResponseInit) => void;
  setFetchError: (error: Error) => void;
};

function createSessionsFetchResponse(init: SessionsResponseInit): {
  ok: boolean;
  status: number;
  json: () => Promise<{ sessions: unknown[] }>;
  text: () => Promise<string>;
} {
  const payload = { sessions: init.sessions ?? [] };
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  };
}

export function createFetchHarness(): FetchHarness {
  const fetchMock = vi.fn(() =>
    Promise.resolve(createSessionsFetchResponse({})),
  );
  vi.stubGlobal("fetch", fetchMock);

  return {
    fetchMock,
    setFetchResponse: (init) => {
      fetchMock.mockResolvedValue(createSessionsFetchResponse(init));
    },
    setFetchError: (error) => {
      fetchMock.mockRejectedValue(error);
    },
  };
}
