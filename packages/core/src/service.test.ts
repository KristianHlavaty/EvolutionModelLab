import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { createSolidPng } from "../../test-fixtures/src/png.js";
import { afterEach, describe, expect, it } from "vitest";

import type { AppError } from "./errors.js";
import { EvolutionModelLabService } from "./service.js";

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
const cleanupRoots: string[] = [];

function createTestService(): {
  service: EvolutionModelLabService;
  testRoot: string;
} {
  const testRoot = resolve(repositoryRoot, ".tmp", "tests", randomUUID());
  cleanupRoots.push(testRoot);
  return {
    testRoot,
    service: new EvolutionModelLabService({
      repositoryRoot,
      databasePath: `${testRoot.slice(repositoryRoot.length + 1).replaceAll("\\", "/")}/data/app.db`,
      workspacePath: `${testRoot.slice(repositoryRoot.length + 1).replaceAll("\\", "/")}/workspace`,
      exportsPath: `${testRoot.slice(repositoryRoot.length + 1).replaceAll("\\", "/")}/exports`,
    }),
  };
}

async function createRound(service: EvolutionModelLabService) {
  const creature = await service.createCreature({
    displayName: "Dunkleosteus",
    scientificName: "Dunkleosteus terrelli",
    description: "Armoured placoderm.",
    generationBrief:
      "A powerful side-view Devonian predator with accurate bony head armour.",
  });
  const round = await service.createConceptRound(creature.id);
  return { creature, round };
}

afterEach(async () => {
  for (const target of cleanupRoots.splice(0)) {
    const safeParent = resolve(repositoryRoot, ".tmp", "tests");
    if (
      !target.startsWith(`${safeParent}\\`) &&
      !target.startsWith(`${safeParent}/`)
    ) {
      throw new Error(`Refusing unsafe test cleanup: ${target}`);
    }
    await rm(target, { recursive: true, force: true });
  }
});

describe("Milestone 1 service", () => {
  it("creates a persisted creature and immutable concept round artifacts", async () => {
    const { service } = createTestService();
    const { creature, round } = await createRound(service);

    expect(creature.displayName).toBe("Dunkleosteus");
    expect(round.roundNumber).toBe(1);
    expect(round.generatedPrompt).toContain("Create 10 visibly different");
    expect(service.getCreature(creature.id).status).toBe("CONCEPT");

    const promptPath = resolve(
      service.workspaceRoot,
      "creatures",
      creature.slug,
      "rounds",
      "round-001-concept",
      "prompt.txt",
    );
    expect(await readFile(promptPath, "utf8")).toContain(
      "Evolution Model Lab — Concept Request",
    );
    service.close();
  });

  it("numbers candidates, preserves original bytes, generates thumbnails, and detects duplicates", async () => {
    const { service } = createTestService();
    const { creature, round } = await createRound(service);
    const firstBytes = createSolidPng(18, 12, [40, 100, 160, 190]);
    const secondBytes = createSolidPng(18, 12, [170, 80, 30, 255]);

    const imported = await service.importCandidates({
      creatureId: creature.id,
      roundId: round.id,
      source: "MANUAL",
      files: [
        { buffer: firstBytes, originalFilename: "..\\unsafe\\first.png" },
        { buffer: secondBytes, originalFilename: "second.png" },
      ],
    });

    expect(imported.map((candidate) => candidate.candidateNumber)).toEqual([
      1, 2,
    ]);
    expect(imported[0]?.originalFilename).toBe("first.png");
    expect(await service.readCandidateOriginal(imported[0]!.id)).toEqual(
      firstBytes,
    );
    const originalMedia = service.getCandidateMedia(imported[0]!.id, "image");
    const thumbnailMedia = service.getCandidateMedia(
      imported[0]!.id,
      "thumbnail",
    );
    expect(originalMedia.path).not.toBe(thumbnailMedia.path);
    expect(await readFile(thumbnailMedia.path)).not.toEqual(firstBytes);

    await expect(
      service.importCandidates({
        creatureId: creature.id,
        roundId: round.id,
        source: "MANUAL",
        files: [{ buffer: firstBytes, originalFilename: "duplicate.png" }],
      }),
    ).rejects.toMatchObject({
      code: "DUPLICATE_IMAGE",
      status: 409,
    } satisfies Partial<AppError>);
    service.close();
  });

  it("selects exactly one candidate and keeps the selection after reopening SQLite", async () => {
    const { service, testRoot } = createTestService();
    const { creature, round } = await createRound(service);
    const imported = await service.importCandidates({
      creatureId: creature.id,
      roundId: round.id,
      source: "CHATGPT",
      files: [
        {
          buffer: createSolidPng(10, 10, [10, 100, 10, 255]),
          originalFilename: "one.png",
        },
        {
          buffer: createSolidPng(10, 10, [100, 10, 10, 255]),
          originalFilename: "two.png",
        },
      ],
    });
    service.selectCandidate(round.id, imported[0]!.id);
    service.selectCandidate(round.id, imported[1]!.id);
    expect(
      service
        .getRound(round.id)
        .candidates.filter((candidate) => candidate.selected),
    ).toEqual([expect.objectContaining({ id: imported[1]!.id })]);
    service.close();

    const relativeTestRoot = testRoot
      .slice(repositoryRoot.length + 1)
      .replaceAll("\\", "/");
    const reopened = new EvolutionModelLabService({
      repositoryRoot,
      databasePath: `${relativeTestRoot}/data/app.db`,
      workspacePath: `${relativeTestRoot}/workspace`,
      exportsPath: `${relativeTestRoot}/exports`,
    });
    expect(reopened.getCreature(creature.id).selectedCandidate?.id).toBe(
      imported[1]!.id,
    );
    expect(reopened.getCreature(creature.id).status).toBe("CANDIDATE_SELECTED");
    reopened.close();
  });

  it("does not save invalid files", async () => {
    const { service, testRoot } = createTestService();
    const { creature, round } = await createRound(service);
    await mkdir(testRoot, { recursive: true });

    await expect(
      service.importCandidates({
        creatureId: creature.id,
        roundId: round.id,
        source: "MANUAL",
        files: [
          {
            buffer: Buffer.from("definitely not png"),
            originalFilename: "fake.png",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_IMAGE",
      status: 400,
    } satisfies Partial<AppError>);
    expect(service.getRound(round.id).candidates).toHaveLength(0);
    service.close();
  });
});
