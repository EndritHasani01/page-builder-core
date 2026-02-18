import { expect, test } from "@playwright/test";

test("keyboard reorder and delete work on selected nodes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Page Builder" })).toBeVisible();

  const palette = page.getByRole("complementary", { name: "Palette" });
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const canvas = page.getByLabel("Canvas editor");

  // Select a column so Text blocks can be inserted into a valid container.
  await page.locator('[data-node-type="column"]').first().click();

  // Insert first Text and set content to "A".
  await palette.getByRole("button", { name: "Text", exact: true }).click();
  await inspector.getByLabel("Text").fill("A");

  // Insert second Text and set content to "B".
  await palette.getByRole("button", { name: "Text", exact: true }).click();
  await inspector.getByLabel("Text").fill("B");

  // Select the first Text node, move it down, and assert DOM order flips to B then A.
  await page.locator('[data-node-type="text"]').first().click();
  await canvas.focus();
  await page.keyboard.press("Alt+ArrowDown");

  await expect(page.locator('[data-node-type="text"] p').nth(0)).toHaveText("B");
  await expect(page.locator('[data-node-type="text"] p').nth(1)).toHaveText("A");

  // Delete the selected node (currently "A") and assert only "B" remains.
  await canvas.focus();
  await page.keyboard.press("Backspace");

  await expect(page.locator('[data-node-type="text"] p')).toHaveCount(1);
  await expect(page.locator('[data-node-type="text"] p').nth(0)).toHaveText("B");
});
