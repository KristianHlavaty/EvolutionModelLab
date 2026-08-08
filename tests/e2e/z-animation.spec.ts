import { resolve } from "node:path";

import { expect, test } from "./fixture.js";

test("creates, reviews, plays, and approves an eight-frame animation", async ({
  page,
}) => {
  const creaturesResponse = await page.request.get("/api/creatures");
  const envelope = (await creaturesResponse.json()) as {
    data: Array<{ id: string; displayName: string }>;
  };
  const creature = envelope.data.find(
    (item) => item.displayName === "Reference Gate Lab",
  );
  expect(creature).toBeTruthy();
  const fixtureRoot = resolve(
    import.meta.dirname,
    "..",
    "..",
    ".tmp",
    "e2e",
    "fixtures",
  );

  await page.goto(`/creatures/${creature!.id}/animations`);
  await expect(
    page.getByRole("heading", { name: "Animation Lab" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Create and save key-pose prompt/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "8-frame swim" }),
  ).toBeVisible();
  await expect(
    page.getByText("8 ordered key poses", { exact: false }),
  ).toBeVisible();

  await page
    .locator('input[type="file"][multiple]')
    .setInputFiles(
      Array.from({ length: 8 }, (_, index) =>
        resolve(
          fixtureRoot,
          `animation-frame-${String(index + 1).padStart(2, "0")}.png`,
        ),
      ),
    );
  await expect(page.locator(".frame-tile")).toHaveCount(8);
  await expect(page.getByText("8 of 8 frames", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();

  await page.getByLabel("Previous onion").check();
  await page.getByLabel("Bounds").check();
  await page.getByLabel("Center").check();
  await page.getByRole("button", { name: "Move frame 2 earlier" }).click();
  await expect(page.locator(".frame-tile").first()).toContainText("key pose");

  await page
    .getByRole("button", { name: "Save intermediate-frame prompt" })
    .click();
  await expect(
    page.getByText("only the missing intermediate frames", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm animation approval" })
    .click();
  await expect(page.getByText(/Animation Lab .* approved/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Animation approved" }),
  ).toBeDisabled();
});
