import type { TerminalTransport } from "../contracts/transport";
import { createBrowserTransport } from "../orchestration/browser-transport";
import {
  createXtermRuntimeProvider,
  type TerminalRuntime,
} from "../runtime/xterm-runtime";

export type TerminalAppEnvironment = {
  createTransport: (url: string) => TerminalTransport;
  loadRuntime: () => Promise<TerminalRuntime>;
  fetchSessions: () => Promise<Response>;
  getDocument: () => Document | null;
  getWindow: () => Window | null;
  getLocalStorage: () => Storage | null;
  getSessionStorage: () => Storage | null;
};

const defaultRuntimeProvider = createXtermRuntimeProvider();

function readLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export const defaultTerminalAppEnvironment: TerminalAppEnvironment = {
  createTransport: (url) => {
    return createBrowserTransport(url);
  },
  loadRuntime: async () => {
    return defaultRuntimeProvider.load();
  },
  fetchSessions: async () => {
    return fetch("/api/sessions", {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  },
  getDocument: () => {
    if (typeof document === "undefined") {
      return null;
    }
    return document;
  },
  getWindow: () => {
    if (typeof window === "undefined") {
      return null;
    }
    return window;
  },
  getLocalStorage: () => {
    if (typeof window === "undefined") {
      return null;
    }
    return readLocalStorage();
  },
  getSessionStorage: () => {
    if (typeof window === "undefined") {
      return null;
    }
    return readSessionStorage();
  },
};
