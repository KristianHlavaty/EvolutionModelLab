import sharp from "sharp";

export interface SpriteFrameInput {
  id: string;
  frameNumber: number;
  durationMs: number;
  buffer: Buffer;
}

export interface SpriteFrameRectangle {
  frameId: string;
  frameNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  durationMs: number;
}

export interface SpriteSheetResult {
  png: Buffer;
  width: number;
  height: number;
  columns: number;
  rows: number;
  frames: SpriteFrameRectangle[];
}

export interface SpriteExporter {
  readonly format: string;
  createSpriteSheet(input: {
    frames: SpriteFrameInput[];
    canvasWidth: number;
    canvasHeight: number;
  }): Promise<SpriteSheetResult>;
}

export class GenericSpriteExporter implements SpriteExporter {
  readonly format = "GENERIC";

  async createSpriteSheet(input: {
    frames: SpriteFrameInput[];
    canvasWidth: number;
    canvasHeight: number;
  }): Promise<SpriteSheetResult> {
    if (input.frames.length === 0) {
      throw new Error("At least one frame is required for a sprite sheet.");
    }
    if (input.canvasWidth < 1 || input.canvasHeight < 1) {
      throw new Error("Sprite-sheet canvas dimensions must be positive.");
    }
    const columns = Math.ceil(Math.sqrt(input.frames.length));
    const rows = Math.ceil(input.frames.length / columns);
    const width = columns * input.canvasWidth;
    const height = rows * input.canvasHeight;
    if (width > 32_768 || height > 32_768 || width * height > 268_435_456) {
      throw new Error(
        "The sprite sheet would exceed the generic exporter's safe dimensions.",
      );
    }
    const frames = input.frames.map((frame, index) => ({
      frameId: frame.id,
      frameNumber: frame.frameNumber,
      x: (index % columns) * input.canvasWidth,
      y: Math.floor(index / columns) * input.canvasHeight,
      width: input.canvasWidth,
      height: input.canvasHeight,
      durationMs: frame.durationMs,
    }));
    const composites = await Promise.all(
      input.frames.map(async (frame, index) => ({
        input: await sharp(frame.buffer)
          .resize({
            width: input.canvasWidth,
            height: input.canvasHeight,
            fit: "contain",
            position: "northwest",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png({ compressionLevel: 9 })
          .toBuffer(),
        left: frames[index]!.x,
        top: frames[index]!.y,
      })),
    );
    const png = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { png, width, height, columns, rows, frames };
  }
}
