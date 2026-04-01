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

  await page.getByRole("button", { name: "Update Team Settings" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Remove Member" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 204");

  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 201");

  await page.getByRole("button", { name: "List Projects" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Load Project Detail" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Create Issue" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 201");

  await page.getByRole("button", { name: "Update Issue" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Load Issue Detail" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Create Sub-Issue" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 201");

  await page.getByRole("button", { name: "Soft Delete Issue" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 204");

  await page.getByRole("button", { name: "Restore Issue" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "List Issues Table" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "List Issues Board" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Transition Issue" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Add Comment" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 201");

  await page.getByRole("button", { name: "Edit Comment" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Delete Comment" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 204");

  await page.getByRole("button", { name: "List Comments" }).click();
  await expect(page.locator("#output")).toContainText("This comment was deleted");

  await page.getByRole("button", { name: "Issue Activity" }).click();
  await expect(page.locator("#output")).toContainText("status_changed");

  await page.getByRole("button", { name: "Add Attachment" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 201");

  await page.getByRole("button", { name: "List Attachments" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Delete Attachment" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 204");

  await page.getByRole("button", { name: "List Notifications" }).click();
  await expect(page.locator("#output")).toContainText("\"unreadCount\"");

  await page.getByRole("button", { name: "Create Cycle" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 201");

  await page.getByRole("button", { name: "Start Cycle" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Assign Issue To Cycle" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Cycle Progress" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Unassign Issue From Cycle" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 204");

  await page.getByRole("button", { name: "Complete Cycle" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Cycle Detail" }).click();
  await expect(page.locator("#output")).toContainText("\"velocitySnapshot\"");

  await page.getByRole("button", { name: "Create Label" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 201");

  await page.getByRole("button", { name: "Create Workflow State" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 201");

  await page.getByRole("button", { name: "Reorder States" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Update Project" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Archive Project" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Refresh Session" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.locator("#output")).toContainText("\"status\": 200");
});
