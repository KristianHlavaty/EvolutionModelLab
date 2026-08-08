import { expect, test } from "./fixture.js";

test("reviews validation and creates a persistent versioned generic export", async ({
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

  await page.goto(`/creatures/${creature!.id}/export`);
  await expect(
    page.getByRole("heading", { name: "Ready for generic export" }),
  ).toBeVisible();
  await expect(page.getByText("8/8")).toBeVisible();
  await expect(
    page.getByText("warning frames", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review new export" }).click();
  await expect(
    page.getByRole("heading", { name: "Create a versioned export" }),
  ).toBeVisible();
  await page.getByTestId("confirm-export").click();
  const run = page.getByTestId("export-v1");
  await expect(run).toBeVisible();
  await expect(run.getByText("8 frames", { exact: false })).toBeVisible();
  await expect(run.locator("code").first()).toContainText("export-v001");
  await run.getByText("packaged files", { exact: false }).click();
  await expect(
    run.getByText("creature-manifest.json", { exact: true }),
  ).toBeVisible();
  await expect(
    run.getByText("validation-report.json", { exact: true }),
  ).toBeVisible();
  await expect(
    run.getByText("sprite-sheet.png", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("export-v1")).toBeVisible();
});
