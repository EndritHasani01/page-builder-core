import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // Dismiss tour if it appears
  const tourClose = page.getByRole("button", { name: /skip|close|dismiss/i });
  if (await tourClose.isVisible({ timeout: 1000 }).catch(() => false)) {
    await tourClose.click();
  }
});

test("Forms section is visible in the palette", async ({ page }) => {
  const palette = page.getByRole("complementary", { name: "Palette" });
  await expect(palette.getByText("Forms")).toBeVisible();
  await expect(palette.getByRole("button", { name: "Form", exact: true })).toBeVisible();
  await expect(palette.getByRole("button", { name: "Text Input", exact: true })).toBeVisible();
  await expect(palette.getByRole("button", { name: "Textarea", exact: true })).toBeVisible();
  await expect(palette.getByRole("button", { name: "Select", exact: true })).toBeVisible();
  await expect(palette.getByRole("button", { name: "Checkbox", exact: true })).toBeVisible();
  await expect(palette.getByRole("button", { name: "Radio Group", exact: true })).toBeVisible();
  await expect(palette.getByRole("button", { name: "Submit Button", exact: true })).toBeVisible();
});

test("Layout and Content sections are still visible in the palette", async ({ page }) => {
  const palette = page.getByRole("complementary", { name: "Palette" });
  await expect(palette.getByText("Layout")).toBeVisible();
  await expect(palette.getByText("Content")).toBeVisible();
  await expect(palette.getByRole("button", { name: "Section", exact: true })).toBeVisible();
  await expect(palette.getByRole("button", { name: "Text", exact: true })).toBeVisible();
});

test("can insert a Form block via the palette button", async ({ page }) => {
  const palette = page.getByRole("complementary", { name: "Palette" });
  const col1 = page.locator('[data-node-type="column"]').nth(0);

  await col1.click();
  await palette.getByRole("button", { name: "Form", exact: true }).click();

  // A form node should appear on canvas
  await expect(page.locator('[data-node-type="form"]')).toBeVisible();
});

test("selecting a Form node shows action, method, and name fields in inspector", async ({ page }) => {
  const palette = page.getByRole("complementary", { name: "Palette" });
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const col1 = page.locator('[data-node-type="column"]').nth(0);

  await col1.click();
  await palette.getByRole("button", { name: "Form", exact: true }).click();

  const formNode = page.locator('[data-node-type="form"]');
  await formNode.click();

  await expect(inspector.getByLabel("Action URL")).toBeVisible();
  await expect(inspector.getByLabel("Method")).toBeVisible();
  await expect(inspector.getByLabel("Form name (optional)")).toBeVisible();
});

test("can insert a Text Input inside a Form and configure it", async ({ page }) => {
  const palette = page.getByRole("complementary", { name: "Palette" });
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const col1 = page.locator('[data-node-type="column"]').nth(0);

  // Add a form
  await col1.click();
  await palette.getByRole("button", { name: "Form", exact: true }).click();

  // Select the form to make it the drop target, then add a text input
  const formNode = page.locator('[data-node-type="form"]');
  await formNode.click();
  await palette.getByRole("button", { name: "Text Input", exact: true }).click();

  // A textInput node should appear
  await expect(page.locator('[data-node-type="textInput"]')).toBeVisible();

  // Select it and configure via inspector
  await page.locator('[data-node-type="textInput"]').click();
  const nameField = inspector.getByLabel("Name (for submission)");
  await nameField.clear();
  await nameField.fill("email");

  // Verify label field is present
  await expect(inspector.getByLabel("Label")).toBeVisible();
  await expect(inspector.getByLabel("Input type")).toBeVisible();
});

test("preview mode shows form elements and blocks submission with toast", async ({ page }) => {
  const palette = page.getByRole("complementary", { name: "Palette" });
  const col1 = page.locator('[data-node-type="column"]').nth(0);

  // Add form with submit button
  await col1.click();
  await palette.getByRole("button", { name: "Form", exact: true }).click();

  const formNode = page.locator('[data-node-type="form"]');
  await formNode.click();
  await palette.getByRole("button", { name: "Submit Button", exact: true }).click();

  // Switch to preview mode
  await page.getByRole("button", { name: /preview/i }).click();

  // The <form> element should exist in preview
  await expect(page.locator("form")).toBeVisible();

  // Submit button should be of type submit
  const submitBtn = page.locator("form button[type=submit]");
  await expect(submitBtn).toBeVisible();

  // Click it — should show a toast, not navigate
  await submitBtn.click();
  await expect(page.getByText("Form submission is disabled in preview")).toBeVisible();
});

test("select field shows options-list editor in inspector", async ({ page }) => {
  const palette = page.getByRole("complementary", { name: "Palette" });
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const col1 = page.locator('[data-node-type="column"]').nth(0);

  // Add form
  await col1.click();
  await palette.getByRole("button", { name: "Form", exact: true }).click();

  const formNode = page.locator('[data-node-type="form"]');
  await formNode.click();
  await palette.getByRole("button", { name: "Select", exact: true }).click();

  await page.locator('[data-node-type="selectInput"]').click();

  // The Options section should be visible with an "Add" button
  await expect(inspector.getByText("Options")).toBeVisible();
  await expect(inspector.getByRole("button", { name: "+ Add" })).toBeVisible();
});
