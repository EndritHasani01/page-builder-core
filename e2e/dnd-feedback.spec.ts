import { expect, test } from "@playwright/test";

/**
 * Starts a drag from `handle` and pauses mid-drag over `target`.
 * Does NOT release the mouse — caller is responsible for that.
 */
async function startDragTo(
  page: import("@playwright/test").Page,
  handle: import("@playwright/test").Locator,
  target: { x: number; y: number },
) {
  const box = await handle.boundingBox();
  if (!box) throw new Error("Drag handle has no bounding box.");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Satisfy activation constraint (distance: 6)
  await page.mouse.move(startX + 10, startY + 2, { steps: 3 });
  await page.mouse.move(target.x, target.y, { steps: 8 });
}

async function dragHandleTo(
  page: import("@playwright/test").Page,
  handle: import("@playwright/test").Locator,
  target: { x: number; y: number },
) {
  await startDragTo(page, handle, target);
  await page.mouse.up();
}

test.describe("DnD visual feedback", () => {
  test("drop slot appears at target position while dragging a text block between sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Save now" })).toBeEnabled();

    const palette = page.getByRole("complementary", { name: "Palette" });
    const inspector = page.getByRole("complementary", { name: "Inspector" });

    // Add two sections
    await palette.getByRole("button", { name: "Section", exact: true }).click();
    await palette.getByRole("button", { name: "Section", exact: true }).click();

    // Add a Text block to the first section
    const sections = page.locator('[data-node-type="section"]');
    await sections.nth(0).click();
    await palette.getByRole("button", { name: "Text", exact: true }).click();
    await inspector.getByLabel("Text").fill("Hello");

    // Get the text node and its drag handle
    const textNode = sections.nth(0).locator('[data-node-type="text"]');
    const dragHandle = textNode.getByLabel("Drag Text");

    // Get second section bounding box
    const section2Box = await sections.nth(1).boundingBox();
    if (!section2Box) throw new Error("Section 2 has no bounding box.");

    // Start drag and hold mid-air over the second section
    await startDragTo(page, dragHandle, {
      x: section2Box.x + section2Box.width / 2,
      y: section2Box.y + section2Box.height / 2,
    });

    // The drop slot should appear somewhere in the document
    await expect(page.locator('[data-testid="drop-slot"]')).toBeVisible();

    // Release the drag
    await page.mouse.up();

    // Drop slot should be gone after drop completes
    await expect(page.locator('[data-testid="drop-slot"]')).toHaveCount(0);
  });

  test("tooltip with rejection reason appears when dragging over an invalid target", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Save now" })).toBeEnabled();

    const palette = page.getByRole("complementary", { name: "Palette" });
    const inspector = page.getByRole("complementary", { name: "Inspector" });

    // Add a section with a text block inside
    const col1 = page.locator('[data-node-type="column"]').nth(0);
    await col1.click();
    await palette.getByRole("button", { name: "Text", exact: true }).click();
    await inspector.getByLabel("Text").fill("Invalid drag");

    const textNode = col1.locator('[data-node-type="text"]');
    const dragHandle = textNode.getByLabel("Drag Text");

    // Try to drag the text node onto the "Columns" container (invalid target)
    const columnsEl = page.locator('[data-node-type="columns"]').first();
    const columnsBox = await columnsEl.boundingBox();
    if (!columnsBox) throw new Error("Columns element has no bounding box.");

    await startDragTo(page, dragHandle, {
      x: columnsBox.x + columnsBox.width / 2,
      y: columnsBox.y + 4,
    });

    // Tooltip explaining the invalid drop should be visible
    await expect(page.locator('[data-testid="drag-tooltip-invalid"]')).toBeVisible();
    // Should contain a reason text (non-empty)
    const tooltipText = await page.locator('[data-testid="drag-tooltip-invalid"]').textContent();
    expect(tooltipText?.trim().length).toBeGreaterThan(0);

    await page.mouse.up();

    // Tooltip disappears after drag ends
    await expect(page.locator('[data-testid="drag-tooltip-invalid"]')).toHaveCount(0);
  });

  test("palette drag shows visual preview card in drag overlay", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Save now" })).toBeEnabled();

    const palettePanel = page.getByRole("complementary", { name: "Palette" });

    // Find the "Text" palette drag handle
    const textItem = palettePanel.locator('[data-palette-block-type="text"]');
    const dragHandle = textItem.getByLabel("Drag Text");

    // Start drag
    const canvasSection = page.getByRole("region", { name: "Canvas" });
    const canvasBox = await canvasSection.boundingBox();
    if (!canvasBox) throw new Error("Canvas has no bounding box.");

    await startDragTo(page, dragHandle, {
      x: canvasBox.x + canvasBox.width / 2,
      y: canvasBox.y + canvasBox.height / 2,
    });

    // Palette drag preview card should be visible (shown in DragOverlay)
    await expect(page.locator('[data-testid="palette-preview-text"]')).toBeVisible();

    await page.mouse.up();
  });
});
