import { test, expect } from "@playwright/test";

test("app loads and shows mode banner", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-testid="banner-mode"]')).toBeVisible();
  await expect(page.locator('[data-testid="banner-mode"]')).toContainText("演示模式");
});
