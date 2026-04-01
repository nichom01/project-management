const { test, expect } = require("@playwright/test");

test("happy-path login refresh logout", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Refresh Session" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");
});
