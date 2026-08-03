import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

test("completes the concept and refinement workflow with feedback, comparison, and contact-sheet crops", async ({
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

  await page.getByRole("link", { name: "Back to creature" }).click();
  await expect(
    page.getByRole("heading", { name: "Dunkleosteus" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open current round" }).click();

  await page
    .getByTestId("candidate-2")
    .getByRole("button", { name: "Select parent" })
    .click();
  await expect(page.getByTestId("candidate-2")).toHaveClass(/selected/);
  await expect(page.getByText("Selection persisted")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("candidate-2")).toHaveClass(/selected/);
  await expect(page.getByTestId("candidate-1")).not.toHaveClass(/selected/);

  await page
    .getByLabel("Preserve traits")
    .fill("Broad armoured skull\nTapered tail");
  await page.getByLabel("Defects").fill("Uneven pectoral fins");
  await page
    .getByLabel("Requested changes")
    .fill("Clarify the eye and jaw edge");
  await page.getByLabel("Forbidden changes").fill("Do not add horns");
  await page.getByRole("button", { name: "Save feedback" }).click();
  await expect(
    page.getByRole("button", { name: "Feedback saved" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create refinement round" }).click();
  await expect(
    page.getByRole("heading", { name: "refinement candidates" }),
  ).toBeVisible();
  await expect(
    page.getByText("Clarify the eye and jaw edge").first(),
  ).toBeVisible();
  await expect(page.getByText("Do not add horns").first()).toBeVisible();
  await expect(page.getByText("Parent candidate: 2")).toBeVisible();

  await page
    .getByLabel("Import candidate PNG images")
    .setInputFiles([
      resolve(fixtureRoot, "refinement-green.png"),
      resolve(fixtureRoot, "refinement-gold.png"),
    ]);
  await expect(page.getByTestId("candidate-1")).toBeVisible();
  await expect(page.getByTestId("candidate-2")).toBeVisible();

  await page
    .getByTestId("candidate-1")
    .getByRole("button", { name: "Compare" })
    .click();
  await page
    .getByTestId("candidate-2")
    .getByRole("button", { name: "Compare" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Compare two candidates" }),
  ).toBeVisible();
  await page.getByLabel("Candidate 1 zoom").fill("1.5");
  await page.getByRole("button", { name: "Close comparison" }).click();

  await page.getByLabel("Layout").selectOption("custom");
  await page.getByLabel("Contact sheet rows").fill("1");
  await page.getByLabel("Contact sheet columns").fill("2");
  await page
    .getByLabel("Contact-sheet PNG")
    .setInputFiles(resolve(fixtureRoot, "two-up-contact-sheet.png"));
  await page.getByRole("button", { name: "Preview crops" }).click();
  await expect(page.getByRole("button", { name: "Crop 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Crop 2" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm 2 crops" }).click();
  await expect(page.getByTestId("candidate-4")).toBeVisible();

  await page
    .getByTestId("candidate-3")
    .getByRole("button", { name: "Select parent" })
    .click();
  await page.getByLabel("General notes").fill("Persist this refinement note.");
  await page.getByRole("button", { name: "Save feedback" }).click();
  await page.reload();
  await expect(page.getByTestId("candidate-3")).toHaveClass(/selected/);
  await expect(page.getByLabel("General notes")).toHaveValue(
    "Persist this refinement note.",
  );

  await page.getByRole("link", { name: "Prompt history" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Dunkleosteus prompt history" }),
  ).toBeVisible();
  await expect(page.getByText("Round 1 · concept")).toBeVisible();
  await expect(page.getByText("Round 2 · refinement")).toBeVisible();
  await expect(
    page.getByText("Clarify the eye and jaw edge").first(),
  ).toBeVisible();
});
