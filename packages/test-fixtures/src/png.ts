import { deflateSync } from "node:zlib";

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

export function createSolidPng(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): Buffer {
  return createPng(width, height, () => rgba);
}

function createPng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => readonly [number, number, number, number],
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.concat(
    Array.from({ length: height }, (_, y) =>
      Buffer.from([
        0,
        ...Array.from({ length: width }, (_, x) => pixel(x, y)).flat(),
      ]),
    ),
  );
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function createGridPng(
  width: number,
  height: number,
  rows: number,
  columns: number,
  colours: ReadonlyArray<readonly [number, number, number, number]>,
): Buffer {
  if (colours.length < rows * columns) {
    throw new Error("Provide one RGBA colour for every grid cell.");
  }
  return createPng(width, height, (x, y) => {
    const column = Math.min(columns - 1, Math.floor((x * columns) / width));
    const row = Math.min(rows - 1, Math.floor((y * rows) / height));
    return colours[row * columns + column]!;
  });
}
