import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixture.js";

async function dispatchImage(
  page: Page,
  kind: "drop" | "paste",
  fixtureName: string,
) {
  const fixturePath = resolve(
    import.meta.dirname,
    "..",
    "..",
    ".tmp",
    "e2e",
    "fixtures",
    fixtureName,
  );
  const bytes = Array.from(await readFile(fixturePath));
  await page.evaluate(
    ({ bytes, fixtureName, kind }) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(bytes)], fixtureName, { type: "image/png" }),
      );
      if (kind === "drop") {
        const target = document.querySelector(".upload-zone");
        if (!(target instanceof HTMLElement)) {
          throw new Error("Candidate upload zone was not found.");
        }
        target.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          }),
        );
        return;
      }
      window.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: transfer,
        }),
      );
    },
    { bytes, fixtureName, kind },
  );
}

test("imports real PNG bytes through drag-and-drop and clipboard fallbacks", async ({
  page,
}) => {
  await page.goto("/creatures/new");
  await page.getByLabel("Display name Required").fill("Handoff Verification");
  await page
    .getByLabel("Generation brief Required")
    .fill("A disposable creature used to verify local image handoff paths.");
  await page.getByRole("button", { name: "Create creature" }).click();
  await page.getByRole("button", { name: "Create concept round" }).click();
  await expect(
    page.getByRole("heading", { name: "concept candidates" }),
  ).toBeVisible();

  await dispatchImage(page, "drop", "armoured-red.png");
  await expect(page.getByTestId("candidate-1")).toBeVisible();

  await dispatchImage(page, "paste", "armoured-blue.png");
  await expect(page.getByTestId("candidate-2")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "2 of 10 candidates" }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("candidate-1")).toBeVisible();
  await expect(page.getByTestId("candidate-2")).toBeVisible();
});
