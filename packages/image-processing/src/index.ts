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
