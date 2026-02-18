import fs from "node:fs/promises";

import { expect, test } from "@playwright/test";

test.use({ acceptDownloads: true });

test("HTML export downloads a sanitized document", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Page Builder" })).toBeVisible();

  const palette = page.getByRole("complementary", { name: "Palette" });
  const inspector = page.getByRole("complementary", { name: "Inspector" });

  await page.locator('[data-node-type="column"]').first().click();

  await palette.getByRole("button", { name: "Button", exact: true }).click();

  await inspector.getByLabel("Label").fill("Unsafe link");
  await inspector.getByLabel("Link URL (optional)").fill("javascript:alert(1)");

  await page.getByRole("button", { name: "Export" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download HTML/ }).click();
  const download = await downloadPromise;

  const path = await download.path();
  expect(path).not.toBeNull();

  const html = await fs.readFile(path as string, "utf8");
  expect(html).toContain("Unsafe link");
  expect(html.toLowerCase()).not.toContain("javascript:");
});

