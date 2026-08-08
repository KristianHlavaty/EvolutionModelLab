import { createSolidPng } from "../../test-fixtures/src/png.js";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { GenericSpriteExporter } from "./index.js";

describe("GenericSpriteExporter", () => {
  it("packs ordered frames into deterministic transparent cells", async () => {
    const exporter = new GenericSpriteExporter();
    const result = await exporter.createSpriteSheet({
      canvasWidth: 8,
      canvasHeight: 6,
      frames: [
        {
          id: "one",
          frameNumber: 1,
          durationMs: 80,
          buffer: createSolidPng(8, 6, [20, 80, 140, 210]),
        },
        {
          id: "two",
          frameNumber: 2,
          durationMs: 90,
          buffer: createSolidPng(8, 6, [140, 80, 20, 220]),
        },
        {
          id: "three",
          frameNumber: 3,
          durationMs: 100,
          buffer: createSolidPng(8, 6, [40, 150, 80, 230]),
        },
      ],
    });
    expect(result).toMatchObject({
      width: 16,
      height: 12,
      columns: 2,
      rows: 2,
    });
    expect(
      result.frames.map(({ frameId, x, y }) => ({ frameId, x, y })),
    ).toEqual([
      { frameId: "one", x: 0, y: 0 },
      { frameId: "two", x: 8, y: 0 },
      { frameId: "three", x: 0, y: 6 },
    ]);
    await expect(sharp(result.png).metadata()).resolves.toMatchObject({
      format: "png",
      width: 16,
      height: 12,
      hasAlpha: true,
    });
  });
});
