import { resolve } from "node:path";

import { expect, test } from "./fixture.js";

test("requests, imports, approves, and gates canonical references", async ({
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
  await page.getByLabel("Display name Required").fill("Reference Gate Lab");
  await page
    .getByLabel("Generation brief Required")
    .fill("A locked side-view creature used to verify canonical references.");
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
  const creatureId = page.url().split("/creatures/")[1]!;
  await page.getByRole("button", { name: /Review and lock design/ }).click();
  await page.getByTestId("confirm-design-lock").click();
  await page.getByRole("link", { name: "References", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Reference Gate Lab references" }),
  ).toBeVisible();
  await expect(page.getByText("3 required references missing")).toBeVisible();
  await expect(page.getByText("Mandatory anchor satisfied")).toBeVisible();

  async function requestImportApprove(
    label: string,
    testId: string,
    fixtureName: string,
  ) {
    const typeCard = page
      .locator(".reference-type-grid article")
      .filter({ hasText: label });
    await typeCard.getByRole("button", { name: "Create prompt" }).click();
    const attempt = page.getByTestId(testId).first();
    await expect(attempt).toBeVisible();
    await attempt.getByText("Saved generation prompt").click();
    await expect(
      attempt.getByText("Create exactly one", { exact: false }),
    ).toBeVisible();
    await attempt
      .getByLabel(`Import ${label} PNG`)
      .setInputFiles(resolve(fixtureRoot, fixtureName));
    await attempt.getByRole("button", { name: "Import and validate" }).click();
    const importedAttempt = page.getByTestId(testId).first();
    await expect(
      importedAttempt.getByText("PNG content validated"),
    ).toBeVisible();
    await importedAttempt
      .getByRole("button", { name: /Review and approve/ })
      .click();
    await page.getByTestId("confirm-reference-approval").click();
    await expect(
      page
        .getByTestId(testId)
        .first()
        .getByText("Approved for this design lock"),
    ).toBeVisible();
  }

  await requestImportApprove(
    "strict side profile",
    "reference-side_profile",
    "refinement-green.png",
  );
  await requestImportApprove(
    "silhouette reference",
    "reference-silhouette",
    "refinement-gold.png",
  );
  await requestImportApprove(
    "colour and material reference",
    "reference-colour_material",
    "two-up-contact-sheet.png",
  );

  await expect(page.getByText("Mandatory set approved")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Mandatory set approved")).toBeVisible();
  await expect(page.getByTestId("reference-side_profile").first()).toHaveClass(
    /approved/,
  );

  await page.getByRole("link", { name: "Mandatory rules" }).click();
  const frontRule = page
    .locator(".settings-reference-list > label")
    .filter({ hasText: "front view" });
  await frontRule.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save mandatory rules" }).click();
  await expect(
    page.getByText("Mandatory-reference rules saved."),
  ).toBeVisible();
  await page.goto(`/creatures/${creatureId}/references`);
  await expect(page.getByText("1 required reference missing")).toBeVisible();

  await page.getByRole("link", { name: "Mandatory rules" }).click();
  await frontRule.getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: "Save mandatory rules" }).click();
  await page.goto(`/creatures/${creatureId}/references`);
  await expect(page.getByText("Mandatory set approved")).toBeVisible();
  await page.getByRole("link", { name: "Creature", exact: true }).click();
  await expect(
    page.getByText("reference approved", { exact: true }),
  ).toBeVisible();
});
