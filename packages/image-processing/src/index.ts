import { createHash } from "node:crypto";
import { basename } from "node:path";

import sharp from "sharp";

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export interface ImageLimits {
  maximumUploadBytes: number;
  maximumImageWidth: number;
  maximumImageHeight: number;
}

export interface InspectedPng {
  width: number;
  height: number;
  hasAlpha: boolean;
  fileHash: string;
  mimeType: "image/png";
  thumbnail: Buffer;
}

export interface AnimationPngMetrics {
  boundingBoxX: number;
  boundingBoxY: number;
  boundingBoxWidth: number;
  boundingBoxHeight: number;
  centerX: number;
  centerY: number;
  opaquePixelCount: number;
  touchesCanvasEdge: boolean;
  perceptualHash: string;
}

export interface InspectedAnimationPng extends InspectedPng {
  metrics: AnimationPngMetrics;
}

export interface ContactSheetLayout {
  rows: number;
  columns: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  horizontalGap: number;
  verticalGap: number;
}

export interface CropRectangle {
  index: number;
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class ImageInspectionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ImageInspectionError";
  }
}

export function normalizeOriginalFilename(value: string): string {
  const leaf = basename(value.replaceAll("\\", "/"));
  const cleaned = Array.from(leaf)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim();
  return (cleaned || "clipboard-image.png").slice(0, 255);
}

export async function inspectPng(
  buffer: Buffer,
  limits: ImageLimits,
): Promise<InspectedPng> {
  if (buffer.length === 0) {
    throw new ImageInspectionError("The uploaded file is empty.", "EMPTY_FILE");
  }
  if (buffer.length > limits.maximumUploadBytes) {
    throw new ImageInspectionError(
      `The image exceeds the ${limits.maximumUploadBytes}-byte upload limit.`,
      "FILE_TOO_LARGE",
    );
  }
  if (
    buffer.length < pngSignature.length ||
    !buffer.subarray(0, 8).equals(pngSignature)
  ) {
    throw new ImageInspectionError(
      "Only valid PNG images are accepted.",
      "UNSUPPORTED_IMAGE",
    );
  }

  try {
    const pipeline = sharp(buffer, {
      failOn: "error",
      limitInputPixels: false,
    });
    const metadata = await pipeline.metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height) {
      throw new ImageInspectionError(
        "The file could not be decoded as a PNG image.",
        "INVALID_PNG",
      );
    }
    if (
      metadata.width > limits.maximumImageWidth ||
      metadata.height > limits.maximumImageHeight
    ) {
      throw new ImageInspectionError(
        `Image dimensions must not exceed ${limits.maximumImageWidth} × ${limits.maximumImageHeight} pixels.`,
        "IMAGE_DIMENSIONS_EXCEEDED",
      );
    }

    const thumbnail = await sharp(buffer, { failOn: "error" })
      .resize({
        width: 640,
        height: 480,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 8 })
      .toBuffer();

    return {
      width: metadata.width,
      height: metadata.height,
      hasAlpha: metadata.hasAlpha ?? false,
      fileHash: createHash("sha256").update(buffer).digest("hex"),
      mimeType: "image/png",
      thumbnail,
    };
  } catch (error) {
    if (error instanceof ImageInspectionError) {
      throw error;
    }
    throw new ImageInspectionError(
      "The PNG is corrupt or could not be decoded.",
      "INVALID_PNG",
    );
  }
}

export async function inspectAnimationPng(
  buffer: Buffer,
  limits: ImageLimits,
): Promise<InspectedAnimationPng> {
  const inspected = await inspectPng(buffer, limits);
  const { data, info } = await sharp(buffer, { failOn: "error" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let opaquePixelCount = 0;
  let xTotal = 0;
  let yTotal = 0;
  let touchesCanvasEdge = false;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3] ?? 0;
      if (alpha === 0) continue;
      opaquePixelCount += 1;
      xTotal += x;
      yTotal += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) {
        touchesCanvasEdge = true;
      }
    }
  }
  const sample = await sharp(buffer, { failOn: "error" })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .resize(8, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  const average =
    sample.reduce((total, value) => total + value, 0) / sample.length;
  let bits = 0n;
  for (const value of sample) {
    bits = (bits << 1n) | (value >= average ? 1n : 0n);
  }
  return {
    ...inspected,
    metrics: {
      boundingBoxX: opaquePixelCount > 0 ? minX : 0,
      boundingBoxY: opaquePixelCount > 0 ? minY : 0,
      boundingBoxWidth: opaquePixelCount > 0 ? maxX - minX + 1 : 0,
      boundingBoxHeight: opaquePixelCount > 0 ? maxY - minY + 1 : 0,
      centerX: opaquePixelCount > 0 ? xTotal / opaquePixelCount : 0,
      centerY: opaquePixelCount > 0 ? yTotal / opaquePixelCount : 0,
      opaquePixelCount,
      touchesCanvasEdge,
      perceptualHash: bits.toString(16).padStart(16, "0"),
    },
  };
}

export function perceptualHashDistance(left: string, right: string): number {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) {
    return 64;
  }
  let different = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (different > 0n) {
    distance += Number(different & 1n);
    different >>= 1n;
  }
  return distance;
}

export function calculateCropRectangles(
  imageWidth: number,
  imageHeight: number,
  layout: ContactSheetLayout,
): CropRectangle[] {
  const integers = [
    imageWidth,
    imageHeight,
    layout.rows,
    layout.columns,
    layout.marginTop,
    layout.marginRight,
    layout.marginBottom,
    layout.marginLeft,
    layout.horizontalGap,
    layout.verticalGap,
  ];
  if (integers.some((value) => !Number.isInteger(value))) {
    throw new ImageInspectionError(
      "Contact-sheet dimensions must be whole pixels.",
      "INVALID_CONTACT_SHEET_LAYOUT",
    );
  }
  if (
    imageWidth < 1 ||
    imageHeight < 1 ||
    layout.rows < 1 ||
    layout.columns < 1 ||
    integers.slice(4).some((value) => value < 0)
  ) {
    throw new ImageInspectionError(
      "Contact-sheet layout values are outside the supported range.",
      "INVALID_CONTACT_SHEET_LAYOUT",
    );
  }
  const usableWidth =
    imageWidth -
    layout.marginLeft -
    layout.marginRight -
    (layout.columns - 1) * layout.horizontalGap;
  const usableHeight =
    imageHeight -
    layout.marginTop -
    layout.marginBottom -
    (layout.rows - 1) * layout.verticalGap;
  if (usableWidth < layout.columns || usableHeight < layout.rows) {
    throw new ImageInspectionError(
      "Margins and gaps leave no usable pixels for one or more crops.",
      "INVALID_CONTACT_SHEET_LAYOUT",
    );
  }

  const rectangles: CropRectangle[] = [];
  for (let row = 0; row < layout.rows; row += 1) {
    const yStart = Math.floor((row * usableHeight) / layout.rows);
    const yEnd = Math.floor(((row + 1) * usableHeight) / layout.rows);
    for (let column = 0; column < layout.columns; column += 1) {
      const xStart = Math.floor((column * usableWidth) / layout.columns);
      const xEnd = Math.floor(((column + 1) * usableWidth) / layout.columns);
      rectangles.push({
        index: rectangles.length,
        row,
        column,
        x: layout.marginLeft + xStart + column * layout.horizontalGap,
        y: layout.marginTop + yStart + row * layout.verticalGap,
        width: xEnd - xStart,
        height: yEnd - yStart,
      });
    }
  }
  return rectangles;
}

export async function cropPng(
  buffer: Buffer,
  rectangle: Pick<CropRectangle, "x" | "y" | "width" | "height">,
): Promise<Buffer> {
  try {
    return await sharp(buffer, { failOn: "error" })
      .extract({
        left: rectangle.x,
        top: rectangle.y,
        width: rectangle.width,
        height: rectangle.height,
      })
      .png({ compressionLevel: 8 })
      .toBuffer();
  } catch {
    throw new ImageInspectionError(
      "A contact-sheet crop could not be generated.",
      "CONTACT_SHEET_CROP_FAILED",
    );
  }
}
