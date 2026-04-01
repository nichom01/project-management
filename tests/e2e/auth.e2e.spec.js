const { test, expect } = require("@playwright/test");

test("happy-path login refresh logout", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Create Organisation" }).click();
  await expect(page.locator("#org-context")).toContainText("Current org: acme-engineering");

  await page.getByRole("button", { name: "Create Team" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 201");

  await page.getByRole("button", { name: "Add Member" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Remove Member" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 204");

  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 201");

  await page.getByRole("button", { name: "Update Project" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Archive Project" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Refresh Session" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");
});
