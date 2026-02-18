import { expect, test } from "@playwright/test";

test("loads the editor shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Page Builder" })).toBeVisible();
  await expect(page.getByText("Palette")).toBeVisible();
  await expect(page.getByText("Inspector")).toBeVisible();
});

