import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    };
  }) as typeof window.matchMedia;
}

if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    return window.setTimeout(() => {
      callback(performance.now());
    }, 0);
  };
}

if (!window.cancelAnimationFrame) {
  window.cancelAnimationFrame = (handle: number): void => {
    window.clearTimeout(handle);
  };
}

class TestResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(): void {
    this.callback([], this as unknown as ResizeObserver);
  }

  disconnect(): void {
    // no-op
  }

  unobserve(): void {
    // no-op
  }
}

if (!window.ResizeObserver) {
  window.ResizeObserver =
    TestResizeObserver as unknown as typeof ResizeObserver;
}

if (window.HTMLCanvasElement) {
  window.HTMLCanvasElement.prototype.getContext = () => null;
}

// jsdom has no top layer or focus trap; Playwright covers those browser behaviors.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
}
