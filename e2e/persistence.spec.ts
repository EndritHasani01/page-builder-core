import { expect, test } from "@playwright/test";

test("saves to LocalStorage and restores on reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Page Builder" })).toBeVisible();

  const palette = page.getByRole("complementary", { name: "Palette" });
  const inspector = page.getByRole("complementary", { name: "Inspector" });

  // Wait for autosave to be enabled so "Save now" is usable.
  await expect(page.getByRole("button", { name: "Save now" })).toBeEnabled();

  // Select a column and insert a Text block.
  await page.locator('[data-node-type="column"]').first().click();
  await palette.getByRole("button", { name: "Text", exact: true }).click();

  await inspector.getByLabel("Text").fill("Persisted");
  await page.getByRole("button", { name: "Save now" }).click();

  await page.reload();
  await expect(page.locator('[data-node-type="text"] p')).toContainText("Persisted");
});

