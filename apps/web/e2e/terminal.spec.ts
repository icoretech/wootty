import { expect, test } from "@playwright/test";

async function waitUntilConnected(
  page: import("@playwright/test").Page,
): Promise<void> {
  await expect(page.getByTestId("status-label")).toHaveText("Connected", {
    timeout: 20_000,
  });
}

// @trace FR-1 e2e-connected-state
// @trace FR-6 e2e-connected-state
// @trace FR-8 e2e-connected-state
test("renders terminal UI and reaches connected state", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("terminal-wrap")).toBeVisible();
  await waitUntilConnected(page);

  await expect(page.getByTestId("session-value")).not.toHaveText("pending");
  await expect(page.getByTestId("terminal-wrap")).toBeVisible();
  await expect(page.getByTestId("terminal-wrap")).toHaveAttribute(
    "aria-label",
    "Terminal viewport",
  );
  await expect(page.locator(".xterm")).toBeVisible();
});

// @trace FR-4 e2e-manual-reconnect
test("manual reconnect returns to connected", async ({ page }) => {
  await page.goto("/");
  await waitUntilConnected(page);

  await page.getByTestId("reconnect-button").click();
  await waitUntilConnected(page);
  await expect(page.getByTestId("session-value")).not.toHaveText("pending");
});

// @trace FR-2 e2e-session-rotation
test("new session rotates session id", async ({ page }) => {
  await page.goto("/");
  await waitUntilConnected(page);

  const session = page.getByTestId("session-value");
  const previousSession = (await session.textContent())?.trim() ?? "";

  await page.getByTestId("session-menu-button").click();
  await expect(page.getByTestId("session-menu")).toBeVisible();
  await page.getByTestId("session-menu-new").click();
  await waitUntilConnected(page);

  await expect(session).not.toHaveText(previousSession, { timeout: 20_000 });
});

test("new tab starts a distinct active session by default", async ({
  page,
}) => {
  await page.goto("/");
  await waitUntilConnected(page);

  const firstSession =
    (await page.getByTestId("session-value").textContent())?.trim() ?? "";
  expect(firstSession.length).toBeGreaterThan(0);
  expect(firstSession).not.toBe("pending");

  const secondPage = await page.context().newPage();
  await secondPage.goto("/");
  await waitUntilConnected(secondPage);

  const secondSession =
    (await secondPage.getByTestId("session-value").textContent())?.trim() ?? "";
  expect(secondSession.length).toBeGreaterThan(0);
  expect(secondSession).not.toBe("pending");
  expect(secondSession).not.toBe(firstSession);

  await secondPage.close();
});

// @trace FR-5 e2e-viewport-resize-stability
test("stays stable through viewport resizes", async ({ page }) => {
  await page.goto("/");
  await waitUntilConnected(page);

  await page.setViewportSize({ width: 420, height: 900 });
  await waitUntilConnected(page);
  await expect(page.getByTestId("terminal-wrap")).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await waitUntilConnected(page);
  await expect(page.getByTestId("terminal-wrap")).toBeVisible();
});

// @trace FR-3 e2e-reconnect-churn
test("stays connected through resize bursts and reconnect churn", async ({
  page,
}) => {
  await page.goto("/");
  await waitUntilConnected(page);

  const sizes = [
    { width: 1240, height: 880 },
    { width: 980, height: 760 },
    { width: 760, height: 900 },
    { width: 420, height: 880 },
    { width: 1366, height: 768 },
  ];

  for (let index = 0; index < 10; index += 1) {
    const size = sizes[index % sizes.length];
    await page.setViewportSize(size);

    if (index % 3 === 2) {
      await page.getByTestId("reconnect-button").click();
      await waitUntilConnected(page);
    }
  }

  await expect(page.getByTestId("session-value")).not.toHaveText("pending");
  await expect(page.getByTestId("terminal-wrap")).toBeVisible();
});

test("handles long output bursts without dropping connection", async ({
  page,
}) => {
  await page.goto("/");
  await waitUntilConnected(page);

  await page.getByTestId("terminal-wrap").click();
  const input = page.locator(".xterm-helper-textarea");
  await expect(input).toBeVisible();
  await input.focus();

  for (let index = 0; index < 140; index += 1) {
    await page.keyboard.type(`line-${index.toString().padStart(3, "0")}`);
    await page.keyboard.press("Enter");
  }

  await waitUntilConnected(page);

  await expect
    .poll(
      async () => {
        const bytesRaw = await page
          .getByTestId("output-value")
          .getAttribute("data-bytes");
        return Number.parseInt(bytesRaw ?? "0", 10);
      },
      { timeout: 12_000 },
    )
    .toBeGreaterThan(1_500);

  await expect(page.getByText("$ line-139")).toBeVisible();
});

// @trace FR-7 e2e-font-preference
test("font size controls update terminal preference", async ({ page }) => {
  await page.goto("/");
  await waitUntilConnected(page);

  await expect
    .poll(async () => {
      return page.evaluate(() => localStorage.getItem("wootty.fontSize"));
    })
    .toBe(null);

  await page.getByTestId("font-increase-button").click();
  await expect
    .poll(async () => {
      return page.evaluate(() => localStorage.getItem("wootty.fontSize"));
    })
    .toBe("12");

  await page.getByTestId("font-decrease-button").click();
  await expect
    .poll(async () => {
      return page.evaluate(() => localStorage.getItem("wootty.fontSize"));
    })
    .toBe("11");

  await page.getByTestId("font-increase-button").click();
  await page.getByTestId("font-reset-button").click();
  await expect
    .poll(async () => {
      return page.evaluate(() => localStorage.getItem("wootty.fontSize"));
    })
    .toBe("11");
});
