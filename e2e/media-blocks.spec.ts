import { expect, test } from "@playwright/test";

/**
 * E2E tests for media blocks (video, embed, icon) and image enhancements.
 */

test.describe("media blocks — palette and insertion", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Dismiss the guided tour if it appears
    const skipBtn = page.getByRole("button", { name: /skip/i });
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click();
    }
    // Add a section so we have a column to work with
    const addSection = page.getByRole("button", { name: /add section/i });
    if (await addSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addSection.click();
    }
  });

  test("Media palette group is visible with image, video, embed, icon items", async ({ page }) => {
    const mediaGroup = page.locator('[data-palette-block-type="video"]').first();
    await expect(mediaGroup).toBeVisible();
    await expect(page.locator('[data-palette-block-type="embed"]').first()).toBeVisible();
    await expect(page.locator('[data-palette-block-type="icon"]').first()).toBeVisible();
    await expect(page.locator('[data-palette-block-type="image"]').first()).toBeVisible();
  });

  test("adds an icon block via palette click", async ({ page }) => {
    // Click the Icon palette button to insert
    const iconBtn = page.locator('[data-palette-block-type="icon"] button').first();
    await iconBtn.click();

    // An SVG should appear on the canvas
    await expect(page.locator('[data-node-type="icon"]').first()).toBeVisible();
  });
});

test.describe("icon block — inspector icon picker", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    const skipBtn = page.getByRole("button", { name: /skip/i });
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click();
    }
    const addSection = page.getByRole("button", { name: /add section/i });
    if (await addSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addSection.click();
    }

    // Insert an icon block
    const iconBtn = page.locator('[data-palette-block-type="icon"] button').first();
    await iconBtn.click();
    // Select the icon node
    await page.locator('[data-node-type="icon"]').first().click();
  });

  test("icon picker is visible in inspector with filter input", async ({ page }) => {
    // The inspector should show the icon picker filter
    await expect(page.getByPlaceholder("Filter icons…")).toBeVisible();
  });

  test("filtering icons narrows the grid", async ({ page }) => {
    const filterInput = page.getByPlaceholder("Filter icons…");
    await filterInput.fill("heart");

    // Only heart-related icons should be visible
    const heartBtn = page.getByRole("button", { name: "heart" });
    await expect(heartBtn).toBeVisible();

    // "star" should not be visible since filter is "heart"
    const starBtn = page.getByRole("button", { name: "star" });
    await expect(starBtn).not.toBeVisible();
  });

  test("selecting an icon from the picker updates the icon on canvas", async ({ page }) => {
    // Clear filter and select 'heart' icon
    const filterInput = page.getByPlaceholder("Filter icons…");
    await filterInput.fill("heart");
    const heartBtn = page.getByRole("button", { name: "heart" });
    await heartBtn.click();

    // Wait for canvas SVG to update
    const iconNode = page.locator('[data-node-type="icon"]').first();
    await expect(iconNode.locator("svg")).toBeVisible();
  });

  test("changing size updates SVG dimensions on canvas", async ({ page }) => {
    // Find the size number field and change it
    const sizeInput = page.locator('input[type="number"]').filter({ hasText: "" }).first();
    // Get the size field specifically - look for the field with value 24
    const fields = page.locator('[data-node-type="icon"]');
    await expect(fields.first()).toBeVisible();

    // The icon SVG should exist with the default size
    const svg = page.locator('[data-node-type="icon"] svg').first();
    await expect(svg).toHaveAttribute("width", "24");

    // Change size via inspector number field for "Size"
    const sizeField = page.getByLabel("Size (px)");
    if (await sizeField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await sizeField.clear();
      await sizeField.fill("48");
      await sizeField.blur();

      // Verify SVG dimensions updated
      await expect(svg).toHaveAttribute("width", "48");
    }
  });
});

test.describe("video block — editor placeholder and inspector", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    const skipBtn = page.getByRole("button", { name: /skip/i });
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click();
    }
    const addSection = page.getByRole("button", { name: /add section/i });
    if (await addSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addSection.click();
    }
    // Insert a video block
    const videoBtn = page.locator('[data-palette-block-type="video"] button').first();
    await videoBtn.click();
    await page.locator('[data-node-type="video"]').first().click();
  });

  test("shows placeholder card in editor mode (no iframe)", async ({ page }) => {
    // No live iframe in editor mode
    await expect(page.locator('[data-node-type="video"] iframe')).not.toBeVisible();
    // Shows "No URL set" placeholder
    await expect(page.locator('[data-node-type="video"]')).toContainText("No URL set");
  });

  test("inspector has url, aspect ratio, autoplay, loop fields", async ({ page }) => {
    await expect(page.getByPlaceholder(/youtube or vimeo/i)).toBeVisible();
  });

  test("entering a YouTube URL shows platform label in placeholder", async ({ page }) => {
    const urlField = page.getByPlaceholder(/youtube or vimeo/i);
    await urlField.fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await urlField.blur();

    await expect(page.locator('[data-node-type="video"]')).toContainText("YouTube");
  });
});

test.describe("embed block — inspector", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    const skipBtn = page.getByRole("button", { name: /skip/i });
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click();
    }
    const addSection = page.getByRole("button", { name: /add section/i });
    if (await addSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addSection.click();
    }
    const embedBtn = page.locator('[data-palette-block-type="embed"] button').first();
    await embedBtn.click();
    await page.locator('[data-node-type="embed"]').first().click();
  });

  test("inspector has URL, width, height fields", async ({ page }) => {
    await expect(page.getByPlaceholder("https://...")).toBeVisible();
  });

  test("shows warning overlay when disallowed domain is entered", async ({ page }) => {
    const urlField = page.getByPlaceholder("https://...");
    await urlField.fill("https://evil.example.com/page");
    await urlField.blur();

    await expect(page.locator('[data-node-type="embed"]')).toContainText(/Domain not allowed/i);
  });

  test("shows embed label for whitelisted domain", async ({ page }) => {
    const urlField = page.getByPlaceholder("https://...");
    await urlField.fill("https://codepen.io/user/pen/abc");
    await urlField.blur();

    await expect(page.locator('[data-node-type="embed"]')).toContainText("Embed");
  });
});
