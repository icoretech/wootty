import { expect, test } from "@playwright/test";

test("reconnect replays retained output exactly once", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("status-label")).toHaveText("Connected");
  const input = page.locator(".xterm-helper-textarea");
  await input.pressSequentially("replay-order-marker");
  await input.press("Enter");
  const output = page.getByText("$ replay-order-marker", { exact: true });
  await expect(output).toHaveCount(1);
  const sessionId = await page.getByTestId("session-value").textContent();

  await page.getByTestId("reconnect-button").click();

  await expect(page.getByTestId("status-label")).toHaveText("Connected");
  await expect(page.getByTestId("session-value")).toHaveText(sessionId ?? "");
  await expect(output).toHaveCount(1);
});

test("terminal focus still allows the controls keyboard shortcut", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("status-label")).toHaveText("Connected");
  const toggle = page.getByTestId("controls-toggle");
  const wasExpanded = await toggle.getAttribute("aria-expanded");

  await page.locator(".xterm-helper-textarea").press("Control+Shift+B");

  await expect(toggle).toHaveAttribute(
    "aria-expanded",
    wasExpanded === "true" ? "false" : "true",
  );
});

test("about dialog makes background inert and restores focus after dismissal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("status-label")).toHaveText("Connected");
  const trigger = page.getByRole("button", {
    name: "About WooTTY",
    exact: true,
  });

  await trigger.press("Enter");

  const dialog = page.getByRole("dialog", { name: "About WooTTY" });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", { name: "Close about dialog" });
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(
    true,
  );
  for (const key of ["Shift+Tab", "Tab", "Tab", "Tab"]) {
    await page.keyboard.press(key);
    // Native dialogs allow browser-chrome focus (body), but no background control.
    await expect
      .poll(() =>
        dialog.evaluate(
          (element) =>
            document.activeElement === document.body ||
            element.contains(document.activeElement),
        ),
      )
      .toBe(true);
  }
  await close.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("about shortcuts fit a narrow screen and backdrop dismisses the dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("status-label")).toHaveText("Connected");

  await page.getByRole("button", { name: "About WooTTY", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "About WooTTY" });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.evaluate((element) => ({
    width: element.clientWidth,
    contentWidth: element.scrollWidth,
    right: element.getBoundingClientRect().right,
    viewport: window.innerWidth,
  }));
  expect(bounds.contentWidth).toBeLessThanOrEqual(bounds.width);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
  await page.mouse.click(2, 2);
  await expect(dialog).not.toBeVisible();
});

test("session menu enters search focus and returns to its trigger on Escape", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("status-label")).toHaveText("Connected");
  const trigger = page.getByTestId("session-menu-button");

  await trigger.press("Enter");

  const search = page.getByRole("searchbox", { name: "Search sessions" });
  await expect(search).toBeFocused();
  await search.press("Escape");
  await expect(page.getByTestId("session-menu")).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
