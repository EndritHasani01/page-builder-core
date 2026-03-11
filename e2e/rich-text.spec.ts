import { expect, test } from "@playwright/test";

test.describe("rich text editing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Page Builder" })).toBeVisible();

    // Insert a Text block into the first column.
    await page.locator('[data-node-type="column"]').first().click();
    await page
      .getByRole("complementary", { name: "Palette" })
      .getByRole("button", { name: "Text", exact: true })
      .click();
  });

  test("inline editing still commits plain text", async ({ page }) => {
    const paragraph = page.locator('[data-node-type="text"] p').first();

    await paragraph.dblclick();
    await expect(paragraph).toHaveAttribute("contenteditable", "true");

    await page.keyboard.press("Control+A");
    await page.keyboard.type("Plain text content");

    // Commit by pressing Enter.
    await page.keyboard.press("Enter");

    await expect(page.locator('[data-node-type="text"] p').first()).toHaveText(
      "Plain text content",
    );
  });

  test("floating toolbar appears on text selection", async ({ page }) => {
    const paragraph = page.locator('[data-node-type="text"] p').first();

    await paragraph.dblclick();
    await expect(paragraph).toHaveAttribute("contenteditable", "true");

    // Select all text via keyboard.
    await page.keyboard.press("Control+A");

    // Floating toolbar should be visible.
    await expect(page.locator('[data-floating-toolbar="true"]')).toBeVisible();
  });

  test("bold formatting applies <strong> on commit", async ({ page }) => {
    const paragraph = page.locator('[data-node-type="text"] p').first();

    await paragraph.dblclick();
    await expect(paragraph).toHaveAttribute("contenteditable", "true");

    // Select all text.
    await page.keyboard.press("Control+A");

    // Click the Bold button in the floating toolbar.
    const boldBtn = page.getByRole("button", { name: "Bold" });
    await expect(boldBtn).toBeVisible();
    await boldBtn.click();

    // Commit by pressing Enter.
    await page.keyboard.press("Enter");

    // After commit the rendered text should contain a <strong> element.
    await expect(
      page.locator('[data-node-type="text"] p strong'),
    ).toBeVisible();
  });

  test("italic formatting applies <em> on commit", async ({ page }) => {
    const paragraph = page.locator('[data-node-type="text"] p').first();

    await paragraph.dblclick();
    await page.keyboard.press("Control+A");

    await page.getByRole("button", { name: "Italic" }).click();
    await page.keyboard.press("Enter");

    await expect(page.locator('[data-node-type="text"] p em')).toBeVisible();
  });

  test("cancel (Escape) discards changes", async ({ page }) => {
    const paragraph = page.locator('[data-node-type="text"] p').first();

    // Capture original text before editing.
    const originalText = await paragraph.textContent();

    await paragraph.dblclick();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Should not be saved");

    // Press Escape to cancel.
    await page.keyboard.press("Escape");

    // Text should be restored to original.
    await expect(page.locator('[data-node-type="text"] p').first()).toHaveText(
      originalText ?? "",
    );
  });
});
