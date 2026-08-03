import { describe, expect, it } from "vitest";

import { createSolidPng } from "../../test-fixtures/src/png.js";
import {
  calculateCropRectangles,
  inspectPng,
  normalizeOriginalFilename,
} from "./index.js";
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

describe("contact-sheet geometry", () => {
  it("calculates deterministic row-major crops with margins and gaps", () => {
    const rectangles = calculateCropRectangles(210, 110, {
      rows: 2,
      columns: 5,
      marginTop: 3,
      marginRight: 7,
      marginBottom: 5,
      marginLeft: 7,
      horizontalGap: 2,
      verticalGap: 4,
    });

    expect(rectangles).toHaveLength(10);
    expect(rectangles[0]).toEqual({
      index: 0,
      row: 0,
      column: 0,
      x: 7,
      y: 3,
      width: 37,
      height: 49,
    });
    expect(rectangles[9]).toEqual({
      index: 9,
      row: 1,
      column: 4,
      x: 165,
      y: 56,
      width: 38,
      height: 49,
    });
  });

  it("rejects layouts whose margins consume the image", () => {
    expect(() =>
      calculateCropRectangles(20, 20, {
        rows: 3,
        columns: 3,
        marginTop: 10,
        marginRight: 10,
        marginBottom: 10,
        marginLeft: 10,
        horizontalGap: 0,
        verticalGap: 0,
      }),
    ).toThrow("Margins and gaps");
  });
});
