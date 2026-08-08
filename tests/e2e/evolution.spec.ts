import { resolve } from "node:path";

import { expect, test } from "./fixture.js";

test("creates, persists, and advances a locked evolutionary lineage", async ({
  page,
}) => {
  const fixtureRoot = resolve(
    import.meta.dirname,
    "..",
    "..",
    ".tmp",
    "e2e",
    "fixtures",
  );

  await page.goto("/creatures/new");
  await page.getByLabel("Display name Required").fill("Tiktaalik Lineage Lab");
  await page.getByLabel("Scientific name").fill("Tiktaalik roseae exemplar");
  await page
    .getByLabel("Generation brief Required")
    .fill("Grounded side-view stem tetrapod with a broad, low silhouette.");
  await page.getByRole("button", { name: "Create creature" }).click();
  await page.getByRole("button", { name: "Create concept round" }).click();
  await page
    .getByLabel("Import candidate PNG images")
    .setInputFiles([
      resolve(fixtureRoot, "armoured-red.png"),
      resolve(fixtureRoot, "armoured-blue.png"),
    ]);
  await page
    .getByTestId("candidate-2")
    .getByRole("button", { name: "Select parent" })
    .click();
  await page.getByRole("link", { name: "Back to creature" }).click();

  const parentId = page.url().split("/creatures/")[1]!;
  await page.getByRole("link", { name: "Edit manifest" }).click();
  const immutable = page
    .locator(".manifest-list-block")
    .filter({ hasText: "Immutable features" });
  await immutable.getByRole("button", { name: "Add entry" }).click();
  await immutable
    .getByRole("textbox", { name: "Immutable features entry 1", exact: true })
    .fill("Broad low skull");
  await page.getByRole("button", { name: "Save manifest" }).click();
  await expect(page.getByText("Manifest saved at version 0.")).toBeVisible();
  await page.getByRole("link", { name: "Creature", exact: true }).click();
  await page.getByRole("button", { name: /Review and lock design/ }).click();
  await page.getByTestId("confirm-design-lock").click();
  await expect(page.getByText("design locked", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Lineage" }).click();
  await expect(
    page.getByRole("heading", { name: "Tiktaalik Lineage Lab lineage" }),
  ).toBeVisible();
  await expect(page.getByText("Generation 0").first()).toBeVisible();
  await page.getByRole("button", { name: "Define descendant" }).click();
  await page.getByLabel("Display name").fill("Estuary Walker");
  await page.getByLabel("Scientific name").fill("Testapoda littoralis");
  await page
    .getByLabel("Descendant generation brief")
    .fill("Adapt the approved ancestor for shallow tidal-flat locomotion.");
  await page
    .getByLabel("Description", { exact: true })
    .nth(1)
    .fill("Broader distal fin rays supporting short substrate pushes");
  await page.getByLabel("Intensity").first().selectOption("4");
  await page.getByRole("button", { name: "Add mutation" }).click();
  await page.getByLabel("Category").nth(1).selectOption("SENSORY");
  await page
    .getByLabel("Description", { exact: true })
    .nth(2)
    .fill("Raised eye placement for surface-level scanning");
  await page.getByLabel("Intensity").nth(1).selectOption("2");
  await page.getByLabel("Inherited adaptation").nth(1).check();
  await page.getByRole("button", { name: "Create evolution round" }).click();

  await expect(
    page.getByRole("heading", { name: "Estuary Walker lineage" }),
  ).toBeVisible();
  await expect(
    page.getByText("Persisted lineage", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Broad low skull")).toBeVisible();
  await expect(
    page.getByText("Broader distal fin rays supporting short substrate pushes"),
  ).toBeVisible();
  await expect(
    page.getByText("Raised eye placement for surface-level scanning"),
  ).toBeVisible();
  await expect(page.getByText("Generation 1").first()).toBeVisible();

  const childId = page.url().split("/creatures/")[1]!.split("/")[0]!;
  const childResponse = await page.request.get(`/api/creatures/${childId}`);
  expect(childResponse.status()).toBe(200);
  const child = (await childResponse.json()) as {
    data: { parentCreatureId: string; currentRoundId: string };
  };
  expect(child.data.parentCreatureId).toBe(parentId);
  await childResponse.dispose();

  await page.getByRole("link", { name: "Creature", exact: true }).click();
  await page.getByRole("link", { name: "Open current round" }).click();
  await expect(
    page.getByRole("heading", { name: "evolution candidates" }),
  ).toBeVisible();
  await expect(
    page.getByText("Approved ancestor: Tiktaalik Lineage Lab"),
  ).toBeVisible();
  await expect(page.getByText("Broad low skull").first()).toBeVisible();
  await expect(
    page.getByText("Raised eye placement for surface-level scanning").first(),
  ).toBeVisible();
  await page
    .getByLabel("Import candidate PNG images")
    .setInputFiles([
      resolve(fixtureRoot, "refinement-green.png"),
      resolve(fixtureRoot, "refinement-gold.png"),
    ]);
  await page
    .getByTestId("candidate-1")
    .getByRole("button", { name: "Select parent" })
    .click();
  await page.reload();
  await expect(page.getByTestId("candidate-1")).toHaveClass(/selected/);

  await page.getByRole("link", { name: "Back to creature" }).click();
  await page.getByRole("button", { name: /Review and lock design/ }).click();
  await page.getByTestId("confirm-design-lock").click();
  await expect(page.getByText("design locked", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Lineage" }).click();
  await expect(page.getByAltText("Estuary Walker descendant")).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Persisted lineage", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Generation 1").first()).toBeVisible();
});
