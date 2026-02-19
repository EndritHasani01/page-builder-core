import { expect, test } from "@playwright/test";

test("inline text editing commits on blur", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Page Builder" })).toBeVisible();

  const palette = page.getByRole("complementary", { name: "Palette" });
  const canvas = page.getByLabel("Canvas editor");

  await expect(page.getByRole("button", { name: "Save now" })).toBeEnabled();

  // Select a column and insert a Text block.
  await page.locator('[data-node-type="column"]').first().click();
  await palette.getByRole("button", { name: "Text", exact: true }).click();

  const paragraph = page.locator('[data-node-type="text"] p').first();

  await paragraph.dblclick();
  await expect(paragraph).toHaveAttribute("contenteditable", "true");

  await page.keyboard.press("Control+A");
  await page.keyboard.type("Inline content");

  // Commit by blurring the contentEditable element.
  await canvas.focus();

  await expect(page.locator('[data-node-type="text"] p')).toHaveText("Inline content");
});

