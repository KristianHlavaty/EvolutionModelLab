import { mkdir, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import {
  createGridPng,
  createSolidPng,
} from "../../packages/test-fixtures/src/png.js";

async function prepareE2eWorkspace(): Promise<void> {
  const repositoryRoot = resolve(import.meta.dirname, "..", "..");
  const e2eRoot = resolve(repositoryRoot, ".tmp", "e2e");
  const relation = relative(resolve(repositoryRoot, ".tmp"), e2eRoot);
  if (relation !== "e2e")
    throw new Error(`Refusing unsafe E2E cleanup: ${e2eRoot}`);
  await rm(e2eRoot, { recursive: true, force: true });
  const fixtureRoot = resolve(e2eRoot, "fixtures");
  await mkdir(fixtureRoot, { recursive: true });
  await writeFile(
    resolve(fixtureRoot, "armoured-red.png"),
    createSolidPng(80, 52, [180, 62, 36, 210]),
  );
  await writeFile(
    resolve(fixtureRoot, "armoured-blue.png"),
    createSolidPng(80, 52, [34, 105, 160, 220]),
  );
  await writeFile(
    resolve(fixtureRoot, "refinement-green.png"),
    createSolidPng(80, 52, [45, 150, 85, 225]),
  );
  await writeFile(
    resolve(fixtureRoot, "refinement-gold.png"),
    createSolidPng(80, 52, [205, 145, 40, 235]),
  );
  await writeFile(
    resolve(fixtureRoot, "two-up-contact-sheet.png"),
    createGridPng(120, 60, 1, 2, [
      [135, 65, 175, 230],
      [40, 175, 175, 215],
    ]),
  );
}

await prepareE2eWorkspace();
