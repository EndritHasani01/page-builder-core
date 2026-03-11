import { expect, test } from "@playwright/test";

// Seeds localStorage so the app opens in editor mode (bypasses dashboard)
async function seedWorkspace(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never, docId = "default") {
  await page.addInitScript(
    ({ id }) => {
      localStorage.setItem("pb:activeDocId", id);
      localStorage.setItem(
        "pb:index:v1",
        JSON.stringify({
          version: 1,
          docs: [{ id, title: "Default", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
        }),
      );
    },
    { id: docId },
  );
}

test("creates a new document and switching isolates edits per docId", async ({ page }) => {
  await seedWorkspace(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Page Builder" })).toBeVisible();

  const docSelect = page.getByLabel("Document", { exact: true });
  await expect(docSelect).toHaveValue("default");

  // Create a second document via the template gallery.
  await page.getByRole("button", { name: "New document" }).click();
  const galleryDialog = page.getByRole("dialog", { name: "Choose a Template" });
  await expect(galleryDialog).toBeVisible();
  await galleryDialog.getByRole("button", { name: "Create" }).click();
  await expect(galleryDialog).not.toBeVisible();
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

test("dashboard shows document cards and search filters correctly", async ({ page }) => {
  // Start fresh (no seeded workspace) so dashboard is shown
  await page.goto("/");

  // The app opens to the dashboard (no activeDocId set)
  await expect(page.getByTestId("workspace-dashboard")).toBeVisible();

  // Create two documents from the dashboard via the template gallery
  await page.getByRole("button", { name: "+ New Page" }).click();
  const gallery1 = page.getByRole("dialog", { name: "Choose a Template" });
  await expect(gallery1).toBeVisible();
  await gallery1.getByLabel("Document title").fill("Alpha Page");
  await gallery1.getByRole("button", { name: "Create" }).click();
  await expect(gallery1).not.toBeVisible();

  // Back to dashboard via Home button
  await page.getByRole("button", { name: "Back to dashboard" }).click();
  await expect(page.getByTestId("workspace-dashboard")).toBeVisible();

  await page.getByRole("button", { name: "+ New Page" }).click();
  const gallery2 = page.getByRole("dialog", { name: "Choose a Template" });
  await expect(gallery2).toBeVisible();
  await gallery2.getByLabel("Document title").fill("Beta Page");
  await gallery2.getByRole("button", { name: "Create" }).click();
  await expect(gallery2).not.toBeVisible();

  // Back to dashboard
  await page.getByRole("button", { name: "Back to dashboard" }).click();
  await expect(page.getByTestId("workspace-dashboard")).toBeVisible();

  // Both cards visible
  await expect(page.getByText("Alpha Page")).toBeVisible();
  await expect(page.getByText("Beta Page")).toBeVisible();

  // Search for "alpha" — only Alpha Page should remain
  await page.getByTestId("dashboard-search").fill("alpha");
  await expect(page.getByText("Alpha Page")).toBeVisible();
  await expect(page.getByText("Beta Page")).not.toBeVisible();

  // Clear search — both visible again
  await page.getByTestId("dashboard-search").fill("");
  await expect(page.getByText("Alpha Page")).toBeVisible();
  await expect(page.getByText("Beta Page")).toBeVisible();
});
