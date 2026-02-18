import { expect, test } from "@playwright/test";

test("creates a new document and switching isolates edits per docId", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Page Builder" })).toBeVisible();

  const docSelect = page.getByLabel("Document", { exact: true });
  await expect(docSelect).toHaveValue("default");

  // Create a second document.
  await page.getByRole("button", { name: "New document" }).click();
  await expect(docSelect).not.toHaveValue("default");

  const doc2Id = await docSelect.inputValue();
  expect(doc2Id).toMatch(/^doc_/);

  const palette = page.getByRole("complementary", { name: "Palette" });
  const inspector = page.getByRole("complementary", { name: "Inspector" });

  const col1 = page.locator('[data-node-type="column"]').nth(0);

  // Add content to doc 2.
  await col1.click();
  await palette.getByRole("button", { name: "Text", exact: true }).click();
  await inspector.getByLabel("Text").fill("Doc2");
  await expect(page.getByText("Doc2", { exact: true })).toBeVisible();

  // Switch back to default and verify doc 2 content is not present.
  await docSelect.selectOption("default");
  await expect(docSelect).toHaveValue("default");
  await expect(page.getByText("Doc2", { exact: true })).toHaveCount(0);

  // Add content to default document.
  await col1.click();
  await palette.getByRole("button", { name: "Text", exact: true }).click();
  await inspector.getByLabel("Text").fill("Doc1");
  await expect(page.getByText("Doc1", { exact: true })).toBeVisible();

  // Switch back to doc 2 and verify isolation both ways.
  await docSelect.selectOption(doc2Id);
  await expect(docSelect).toHaveValue(doc2Id);
  await expect(page.getByText("Doc2", { exact: true })).toBeVisible();
  await expect(page.getByText("Doc1", { exact: true })).toHaveCount(0);
});
