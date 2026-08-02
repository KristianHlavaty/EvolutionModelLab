import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { AppError } from "./errors.js";
import {
  assertPathWithin,
  fromRepositoryRelative,
  resolveWithin,
} from "./paths.js";

describe("guarded paths", () => {
  const root = resolve("C:/repository/workspace");

  it("accepts descendants", () => {
    expect(resolveWithin(root, "creatures", "dunkleosteus")).toContain(
      "dunkleosteus",
    );
  });

  it("rejects directory traversal and absolute stored paths", () => {
    expect(() =>
      assertPathWithin(root, resolve(root, "..", "outside")),
    ).toThrow(AppError);
    expect(() =>
      fromRepositoryRelative(root, resolve(root, "absolute.png")),
    ).toThrow(AppError);
  });
});
