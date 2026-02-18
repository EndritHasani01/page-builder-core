import { expect, test } from "@playwright/test";

async function dragHandleTo(page: import("@playwright/test").Page, handle: import("@playwright/test").Locator, target: { x: number; y: number }) {
  const box = await handle.boundingBox();
  if (!box) throw new Error("Drag handle has no bounding box.");

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Move a little to satisfy the activation constraint.
  await page.mouse.move(startX + 12, startY + 2);
  await page.mouse.move(target.x, target.y);
  await page.mouse.up();
}

test("drag and drop reorders within a column and supports cross-column move", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Page Builder" })).toBeVisible();

  const palette = page.getByRole("complementary", { name: "Palette" });
  const inspector = page.getByRole("complementary", { name: "Inspector" });

  await expect(page.getByRole("button", { name: "Save now" })).toBeEnabled();

  const col1 = page.locator('[data-node-type="column"]').nth(0);
  const col2 = page.locator('[data-node-type="column"]').nth(1);

  // Create two Text blocks in column 1.
  await col1.click();
  await palette.getByRole("button", { name: "Text", exact: true }).click();
  await inspector.getByLabel("Text").fill("A");

  await palette.getByRole("button", { name: "Text", exact: true }).click();
  await inspector.getByLabel("Text").fill("B");

  await expect(col1.locator('[data-node-type="text"] p')).toHaveCount(2);
  await expect(col1.locator('[data-node-type="text"] p').nth(0)).toHaveText("A");
  await expect(col1.locator('[data-node-type="text"] p').nth(1)).toHaveText("B");

  // Reorder: drag B above A.
  const wrapperA = col1.locator('[data-node-type="text"]').filter({ has: page.locator('p', { hasText: /^A$/ }) });
  const wrapperB = col1.locator('[data-node-type="text"]').filter({ has: page.locator('p', { hasText: /^B$/ }) });
  const handleB = wrapperB.getByLabel("Drag Text");

  const boxA = await wrapperA.boundingBox();
  if (!boxA) throw new Error("Text A has no bounding box.");
  await dragHandleTo(page, handleB, { x: boxA.x + boxA.width / 2, y: boxA.y + 6 });

  await expect(col1.locator('[data-node-type="text"] p').nth(0)).toHaveText("B");
  await expect(col1.locator('[data-node-type="text"] p').nth(1)).toHaveText("A");

  // Cross-container: drag A into column 2 (second item avoids overlap with the Column drag handle).
  const boxCol2 = await col2.boundingBox();
  if (!boxCol2) throw new Error("Column 2 has no bounding box.");
  const handleAAfter = col1
    .locator('[data-node-type="text"]')
    .filter({ has: page.locator('p', { hasText: /^A$/ }) })
    .getByLabel("Drag Text");
  await dragHandleTo(page, handleAAfter, { x: boxCol2.x + boxCol2.width / 2, y: boxCol2.y + 20 });

  await expect(col1.locator('[data-node-type="text"] p')).toHaveCount(1);
  await expect(col1.locator('[data-node-type="text"] p').nth(0)).toHaveText("B");
  await expect(col2.locator('[data-node-type="text"] p')).toHaveCount(1);
  await expect(col2.locator('[data-node-type="text"] p').nth(0)).toHaveText("A");
});

test("invalid drops are blocked with a visible error", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Page Builder" })).toBeVisible();

  const palette = page.getByRole("complementary", { name: "Palette" });
  const inspector = page.getByRole("complementary", { name: "Inspector" });

  await expect(page.getByRole("button", { name: "Save now" })).toBeEnabled();

  const col1 = page.locator('[data-node-type="column"]').nth(0);
  const columns = page.locator('[data-node-type="columns"]').first();

  await col1.click();
  await palette.getByRole("button", { name: "Text", exact: true }).click();
  await inspector.getByLabel("Text").fill("Invalid");

  const handle = col1.locator('[data-node-type="text"]').filter({ hasText: "Invalid" }).getByLabel("Drag Text");
  const boxColumns = await columns.boundingBox();
  if (!boxColumns) throw new Error("Columns container has no bounding box.");

  await dragHandleTo(page, handle, { x: boxColumns.x + boxColumns.width / 2, y: boxColumns.y + boxColumns.height / 2 });

  await expect(page.getByText(/Cannot insert into Columns directly/i)).toBeVisible();
  await expect(col1.locator('[data-node-type="text"] p')).toHaveCount(1);
});
