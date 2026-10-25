import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../../../src/App";

vi.mock("../../../src/features/terminal/app/TerminalApp", () => ({
  TerminalApp: () => {
    throw new Error("simulated render failure");
  },
}));

describe("application render failures", () => {
  it("shows an accessible recovery screen when the terminal cannot render", () => {
    const onCaughtError = vi.fn();

    expect(() => render(<App />, { onCaughtError })).not.toThrow();

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Reload terminal" }),
    ).not.toBeNull();
    expect(onCaughtError).toHaveBeenCalledOnce();
  });
});
