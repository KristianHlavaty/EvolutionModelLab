import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

test("creates Dunkleosteus, imports concepts, and persists one selection", async ({
  page,
}) => {
  await page.goto("/creatures/new");
  await page.getByLabel("Display name Required").fill("Dunkleosteus");
  await page.getByLabel("Scientific name").fill("Dunkleosteus terrelli");
  await page
    .getByLabel("Generation brief Required")
    .fill(
      "Armoured Devonian predator, readable side silhouette, natural ochre plate armour.",
    );
  await page.getByRole("button", { name: "Create creature" }).click();

  await expect(
    page.getByRole("heading", { name: "Dunkleosteus" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create concept round" }).click();
  await expect(
    page.getByRole("heading", { name: "concept candidates" }),
  ).toBeVisible();
  await expect(page.getByText("Create 10 visibly different")).toBeVisible();

  const fixtureRoot = resolve(
    import.meta.dirname,
    "..",
    "..",
    ".tmp",
    "e2e",
    "fixtures",
  );
  await page
    .getByLabel("Import candidate PNG images")
    .setInputFiles([
      resolve(fixtureRoot, "armoured-red.png"),
      resolve(fixtureRoot, "armoured-blue.png"),
    ]);
  await expect(page.getByTestId("candidate-1")).toBeVisible();
  await expect(page.getByTestId("candidate-2")).toBeVisible();

  await page
    .getByTestId("candidate-2")
    .getByRole("button", { name: "Select parent" })
    .click();
  await expect(page.getByTestId("candidate-2")).toHaveClass(/selected/);
  await expect(page.getByText("Selection persisted")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("candidate-2")).toHaveClass(/selected/);
  await expect(page.getByTestId("candidate-1")).not.toHaveClass(/selected/);
});
