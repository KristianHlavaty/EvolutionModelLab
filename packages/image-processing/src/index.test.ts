import { describe, expect, it } from "vitest";

import { createSolidPng } from "../../test-fixtures/src/png.js";
import { inspectPng, normalizeOriginalFilename } from "./index.js";
import type { ImageInspectionError } from "./index.js";

const limits = {
  maximumUploadBytes: 1_000_000,
  maximumImageWidth: 128,
  maximumImageHeight: 128,
};

describe("PNG inspection", () => {
  it("verifies bytes, dimensions, alpha, hash, and creates a separate thumbnail", async () => {
    const original = createSolidPng(8, 6, [20, 80, 120, 180]);
    const inspected = await inspectPng(original, limits);

    expect(inspected.width).toBe(8);
    expect(inspected.height).toBe(6);
    expect(inspected.hasAlpha).toBe(true);
    expect(inspected.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(inspected.thumbnail).not.toBe(original);
    expect(original.subarray(0, 8)).toEqual(inspected.thumbnail.subarray(0, 8));
  });

  it("rejects files whose declarations could not make them real PNGs", async () => {
    await expect(
      inspectPng(Buffer.from("not an image"), limits),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_IMAGE",
    } satisfies Partial<ImageInspectionError>);
  });
});

describe("original filename metadata", () => {
  it("removes path components and control characters", () => {
    expect(normalizeOriginalFilename("..\\unsafe\\du\u0000nkle.png")).toBe(
      "dunkle.png",
    );
    expect(normalizeOriginalFilename("")).toBe("clipboard-image.png");
  });
});
