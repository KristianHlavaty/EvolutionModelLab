import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "./fixture.js";

test("edits, locks, protects, unlocks, and relocks a refinement design", async ({
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
  await page.getByLabel("Display name Required").fill("Acanthostega Lock Lab");
  await page
    .getByLabel("Generation brief Required")
    .fill("Grounded side-view early tetrapod with a readable low silhouette.");
  await page.getByRole("button", { name: "Create creature" }).click();
  await page.getByRole("button", { name: "Create concept round" }).click();
  await page
    .getByLabel("Import candidate PNG images")
    .setInputFiles([
      resolve(fixtureRoot, "armoured-red.png"),
      resolve(fixtureRoot, "armoured-blue.png"),
    ]);
  await page
    .getByTestId("candidate-1")
    .getByRole("button", { name: "Select parent" })
    .click();
  await page.getByRole("button", { name: "Create refinement round" }).click();
  await expect(
    page.getByRole("heading", { name: "refinement candidates" }),
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
  await page.getByRole("link", { name: "Back to creature" }).click();

  const creatureUrl = page.url();
  const creatureId = creatureUrl.split("/creatures/")[1]!;
  await page.getByRole("link", { name: "Edit manifest" }).click();

  const featureBlocks = page.locator(".manifest-list-block");
  const immutable = featureBlocks.filter({ hasText: "Immutable features" });
  const preferred = featureBlocks.filter({ hasText: "Preferred features" });
  const forbidden = featureBlocks.filter({ hasText: "Forbidden features" });
  await immutable.getByRole("button", { name: "Add entry" }).click();
  await immutable
    .getByRole("textbox", { name: "Immutable features entry 1", exact: true })
    .fill("Broad low skull");
  await immutable.getByRole("button", { name: "Add entry" }).click();
  await immutable
    .getByRole("textbox", { name: "Immutable features entry 2", exact: true })
    .fill("Eight visible digits");
  await immutable
    .getByRole("button", { name: "Move Immutable features entry 2 up" })
    .click();
  await preferred.getByRole("button", { name: "Add entry" }).click();
  await preferred
    .getByRole("textbox", { name: "Preferred features entry 1", exact: true })
    .fill("Muted olive palette");
  await forbidden.getByRole("button", { name: "Add entry" }).click();
  await forbidden
    .getByRole("textbox", { name: "Forbidden features entry 1", exact: true })
    .fill("No horns");
  await page.getByLabel("Canvas width").fill("1280");
  await page.getByLabel("Canvas height").fill("720");
  await page.getByLabel("Anchor X").fill("640");
  await page.getByLabel("Anchor Y").fill("700");
  await page.getByLabel("Facing").selectOption("left");
  await expect(
    page.getByLabel("Transparent background required"),
  ).toBeChecked();
  await page.getByRole("button", { name: "Save manifest" }).click();
  await expect(page.getByText("Manifest saved at version 0.")).toBeVisible();
  await page.getByRole("link", { name: "Creature", exact: true }).click();

  await page.getByRole("button", { name: "Review and lock design…" }).click();
  await expect(
    page.getByRole("heading", { name: "Lock authoritative design" }),
  ).toBeVisible();
  await expect(page.getByText("Candidate 1").last()).toBeVisible();
  await expect(page.getByText("Source round 2")).toBeVisible();
  await expect(
    page.getByText("Eight visible digits · Broad low skull"),
  ).toBeVisible();
  await expect(page.getByText("No horns")).toBeVisible();
  await expect(page.getByText("1280 × 720, anchor 640/700")).toBeVisible();
  await expect(page.getByText("left", { exact: true })).toBeVisible();
  await page.getByTestId("confirm-design-lock").click();

  await expect(page.getByText("design locked", { exact: true })).toBeVisible();
  await expect(page.getByText("Candidate 1, round 2")).toBeVisible();
  const firstLockedImage = await page.request.get(
    `/api/creatures/${creatureId}/locked-design`,
  );
  expect(firstLockedImage.status()).toBe(200);
  expect(await firstLockedImage.body()).toEqual(
    await readFile(resolve(fixtureRoot, "refinement-green.png")),
  );
  await firstLockedImage.dispose();
  await page.reload();
  await expect(page.getByText("design locked", { exact: true })).toBeVisible();
  await expect(page.getByText("Frozen with manifest version 1")).toBeVisible();
  await page.getByRole("link", { name: "Edit manifest" }).click();
  await expect(
    page.getByRole("textbox", {
      name: "Immutable features entry 1",
      exact: true,
    }),
  ).toHaveValue("Eight visible digits");
  await expect(
    page.getByText("Locked design uses frozen manifest version 1"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Creature", exact: true }).click();
  await page.getByRole("link", { name: "Open current round" }).click();
  await expect(page.getByTestId("candidate-1")).toHaveClass(/locked/);

  const candidateResponse = await page.request.get(
    "/api/rounds/" + page.url().split("/rounds/")[1],
  );
  const candidateBody = (await candidateResponse.json()) as {
    data: { id: string; candidates: Array<{ id: string; locked: boolean }> };
  };
  const lockedCandidate = candidateBody.data.candidates.find(
    (candidate) => candidate.locked,
  )!;
  await candidateResponse.dispose();
  const rejectResponse = await page.request.patch(
    `/api/candidates/${lockedCandidate.id}/rejection`,
    { data: { rejected: true } },
  );
  expect(rejectResponse.status()).toBe(409);
  expect((await rejectResponse.json()).error.code).toBe(
    "LOCKED_CANDIDATE_PROTECTED",
  );
  await rejectResponse.dispose();
  const deleteResponse = await page.request.delete(
    `/api/candidates/${lockedCandidate.id}`,
    {
      data: { confirmed: true },
    },
  );
  expect(deleteResponse.status()).toBe(409);
  expect((await deleteResponse.json()).error.code).toBe(
    "LOCKED_CANDIDATE_PROTECTED",
  );
  await deleteResponse.dispose();

  await page.getByRole("link", { name: "Back to creature" }).click();
  await page.getByRole("button", { name: "Unlock design…" }).click();
  await expect(
    page.getByRole("heading", { name: "Unlock authoritative design" }),
  ).toBeVisible();
  await expect(
    page.getByText("complete history will be preserved"),
  ).toBeVisible();
  await page.getByTestId("confirm-design-unlock").click();
  await expect(
    page.getByRole("heading", { name: "Design ready for review" }),
  ).toBeVisible();
  await expect(page.getByText("#1 · candidate 1 · unlocked")).toBeVisible();

  await page.getByRole("link", { name: "Open current round" }).click();
  await page
    .getByTestId("candidate-2")
    .getByRole("button", { name: "Select parent" })
    .click();
  await page.getByRole("link", { name: "Back to creature" }).click();
  await page.getByRole("button", { name: "Review and lock design…" }).click();
  await expect(page.getByText("Candidate 2").last()).toBeVisible();
  await page.getByTestId("confirm-design-lock").click();
  await expect(page.getByText("Candidate 2, round 2")).toBeVisible();
  await expect(
    page.getByText("#1 · candidate 1 · superseded · archived"),
  ).toBeVisible();

  const firstFixture = await readFile(
    resolve(fixtureRoot, "refinement-green.png"),
  );
  const archived = await readFile(
    resolve(
      import.meta.dirname,
      "..",
      "..",
      ".tmp",
      "e2e",
      "workspace",
      "creatures",
      "acanthostega-lock-lab",
      "history",
      "locked-designs",
      "locked-design-v001.png",
    ),
  );
  expect(archived).toEqual(firstFixture);
});
