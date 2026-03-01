import { describe, expect, it } from "vitest";
import { floatingControlDescriptor } from "../../../../src/features/terminal/commands/floating-controls/catalog";

describe("floating control descriptors", () => {
  it("keeps UI metadata complete for every floating control action", () => {
    expect({
      reconnect: floatingControlDescriptor("reconnect"),
      clear: floatingControlDescriptor("clear"),
      decreaseFont: floatingControlDescriptor("decreaseFont"),
      increaseFont: floatingControlDescriptor("increaseFont"),
      resetFont: floatingControlDescriptor("resetFont"),
      fullscreen: floatingControlDescriptor("fullscreen"),
    }).toEqual({
      reconnect: {
        tooltip: "Reconnect",
        ariaLabel: "Reconnect terminal session",
        ariaKeyShortcuts: "Control+Shift+R Meta+Shift+R",
      },
      clear: {
        tooltip: "Clear",
        ariaLabel: "Clear terminal viewport",
        ariaKeyShortcuts: "Control+Shift+K Meta+Shift+K",
      },
      decreaseFont: {
        tooltip: "Font down",
        ariaLabel: "Decrease terminal font size",
        ariaKeyShortcuts: "Control+Shift+- Meta+Shift+-",
      },
      increaseFont: {
        tooltip: "Font up",
        ariaLabel: "Increase terminal font size",
        ariaKeyShortcuts: "Control+Shift+= Meta+Shift+=",
      },
      resetFont: {
        tooltip: "Reset font",
        ariaLabel: "Reset terminal font size",
        ariaKeyShortcuts: "Control+Shift+0 Meta+Shift+0",
      },
      fullscreen: {
        tooltip: "Fullscreen",
        ariaLabel: "Toggle fullscreen terminal",
      },
    });
  });
});
