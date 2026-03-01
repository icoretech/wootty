export function readStorage(
  kind: "localStorage" | "sessionStorage",
): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window[kind];
  } catch {
    return null;
  }
}

export function readDocument(): Document | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document;
}

export function readWindow(): Window | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window;
}
