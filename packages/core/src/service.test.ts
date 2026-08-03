import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createGridPng, createSolidPng } from "../../test-fixtures/src/png.js";
import { createDatabase } from "@eml/database";
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

describe("Milestone 2 service", () => {
  it("migrates a Milestone 1 database without losing its selected creature data", async () => {
    const testRoot = resolve(repositoryRoot, ".tmp", "tests", randomUUID());
    cleanupRoots.push(testRoot);
    const oldMigrations = resolve(testRoot, "migrations");
    await mkdir(resolve(oldMigrations, "meta"), { recursive: true });
    await writeFile(
      resolve(oldMigrations, "0000_milestone_one.sql"),
      await readFile(
        resolve(
          repositoryRoot,
          "packages",
          "database",
          "drizzle",
          "0000_milestone_one.sql",
        ),
      ),
    );
    await writeFile(
      resolve(oldMigrations, "meta", "_journal.json"),
      JSON.stringify({
        version: "7",
        dialect: "sqlite",
        entries: [
          {
            idx: 0,
            version: "6",
            when: 1785700800000,
            tag: "0000_milestone_one",
            breakpoints: true,
          },
        ],
      }),
    );
    const relativeTestRoot = testRoot
      .slice(repositoryRoot.length + 1)
      .replaceAll("\\", "/");
    const creatureId = randomUUID();
    const roundId = randomUUID();
    const candidateId = randomUUID();
    const timestamp = new Date().toISOString();
    const oldDatabase = createDatabase(
      resolve(testRoot, "data", "app.db"),
      oldMigrations,
    );
    oldDatabase.sqlite
      .prepare(
        "INSERT INTO creature_projects (id, slug, display_name, description, generation_brief, status, current_round_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        creatureId,
        "migrating-creature",
        "Migrating creature",
        "Milestone 1 data",
        "Preserve this existing project.",
        "CANDIDATE_SELECTED",
        roundId,
        timestamp,
        timestamp,
      );
    oldDatabase.sqlite
      .prepare(
        "INSERT INTO generation_rounds (id, creature_project_id, round_number, round_type, generated_prompt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(roundId, creatureId, 1, "CONCEPT", "Existing prompt", timestamp);
    oldDatabase.sqlite
      .prepare(
        "INSERT INTO candidates (id, generation_round_id, candidate_number, image_path, thumbnail_path, source, original_filename, width, height, has_alpha, file_hash, mime_type, rejected, selected, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        candidateId,
        roundId,
        1,
        `${relativeTestRoot}/workspace/parent.png`,
        `${relativeTestRoot}/workspace/parent-thumb.png`,
        "MANUAL",
        "m1-parent.png",
        10,
        10,
        1,
        "a".repeat(64),
        "image/png",
        0,
        1,
        timestamp,
      );
    oldDatabase.close();

    const upgraded = new EvolutionModelLabService({
      repositoryRoot,
      databasePath: `${relativeTestRoot}/data/app.db`,
      workspacePath: `${relativeTestRoot}/workspace`,
      exportsPath: `${relativeTestRoot}/exports`,
    });
    expect(upgraded.getCreature(creatureId).selectedCandidate?.id).toBe(
      candidateId,
    );
    upgraded.saveCandidateFeedback(candidateId, {
      ...emptyFeedbackForTest(),
      preserveTraits: ["Keep the Milestone 1 design"],
    });
    expect((await upgraded.createRefinementRound(creatureId)).roundNumber).toBe(
      2,
    );
    upgraded.close();
  });

  it("rejects refinement without a selection and freezes selected feedback into immutable history", async () => {
    const { service } = createTestService();
    const { creature, round } = await createRound(service);

    await expect(
      service.createRefinementRound(creature.id),
    ).rejects.toMatchObject({
      code: "REFINEMENT_PARENT_REQUIRED",
      status: 409,
    } satisfies Partial<AppError>);

    const [parent] = await service.importCandidates({
      creatureId: creature.id,
      roundId: round.id,
      source: "CHATGPT",
      files: [
        {
          buffer: createSolidPng(20, 12, [120, 80, 35, 230]),
          originalFilename: "parent.png",
        },
      ],
    });
    service.selectCandidate(round.id, parent!.id);
    const savedFeedback = service.saveCandidateFeedback(parent!.id, {
      preserveTraits: ["Broad skull", "Heavy armour"],
      anatomyToPreserve: ["Jaw proportions"],
      paletteToPreserve: ["Ochre plates"],
      silhouetteToPreserve: ["Tapered tail"],
      defects: ["Uneven fins"],
      requestedChanges: ["Clarify the eye"],
      forbiddenChanges: ["No horns"],
      generalNotes: "Keep it grounded.",
    });
    expect(savedFeedback.preserveTraits).toEqual([
      "Broad skull",
      "Heavy armour",
    ]);

    const conceptBefore = service.getRound(round.id);
    const refinement = await service.createRefinementRound(creature.id);

    expect(refinement.roundNumber).toBe(2);
    expect(refinement.roundType).toBe("REFINEMENT");
    expect(refinement.parentCandidate?.id).toBe(parent!.id);
    expect(refinement.feedbackSnapshot).toEqual({
      preserveTraits: ["Broad skull", "Heavy armour"],
      anatomyToPreserve: ["Jaw proportions"],
      paletteToPreserve: ["Ochre plates"],
      silhouetteToPreserve: ["Tapered tail"],
      defects: ["Uneven fins"],
      requestedChanges: ["Clarify the eye"],
      forbiddenChanges: ["No horns"],
      generalNotes: "Keep it grounded.",
    });
    expect(refinement.generatedPrompt).toContain("Clarify the eye");
    expect(refinement.generatedPrompt).toContain("Canvas: 1024 × 1024");
    expect(refinement.generatedPrompt).toContain(
      "Do not perform unrelated anatomy redesigns",
    );
    expect(service.getCreature(creature.id)).toMatchObject({
      status: "REFINING",
      selectedCandidate: { id: parent!.id },
    });
    expect(service.getRound(round.id)).toEqual(conceptBefore);
    expect(service.getPromptHistory(creature.id)).toHaveLength(2);
    expect(() => service.selectCandidate(round.id, parent!.id)).toThrowError(
      expect.objectContaining({ code: "HISTORICAL_ROUND_IMMUTABLE" }),
    );
    await expect(
      service.importCandidates({
        creatureId: creature.id,
        roundId: round.id,
        source: "MANUAL",
        files: [
          {
            buffer: createSolidPng(8, 8, [1, 2, 3, 255]),
            originalFilename: "late.png",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "HISTORICAL_ROUND_IMMUTABLE" });

    const artifactRoot = resolve(
      service.workspaceRoot,
      "creatures",
      creature.slug,
      "rounds",
      "round-002-refinement",
    );
    expect(
      await readFile(resolve(artifactRoot, "prompt.txt"), "utf8"),
    ).toContain("Ochre plates");
    const context = JSON.parse(
      await readFile(resolve(artifactRoot, "generation-context.json"), "utf8"),
    ) as { parentCandidate: { id: string }; feedback: { defects: string[] } };
    expect(context.parentCandidate.id).toBe(parent!.id);
    expect(context.feedback.defects).toEqual(["Uneven fins"]);
    service.close();
  });

  it("keeps structured feedback attached to the correct selected candidate after reopening", async () => {
    const { service, testRoot } = createTestService();
    const { creature, round } = await createRound(service);
    const [candidate] = await service.importCandidates({
      creatureId: creature.id,
      roundId: round.id,
      source: "MANUAL",
      files: [
        {
          buffer: createSolidPng(12, 12, [50, 100, 150, 255]),
          originalFilename: "selected.png",
        },
      ],
    });
    service.selectCandidate(round.id, candidate!.id);
    service.saveCandidateFeedback(candidate!.id, {
      ...emptyFeedbackForTest(),
      requestedChanges: ["Shorten lower jaw", "Increase eye contrast"],
      generalNotes: "Second-pass notes.",
    });
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
    expect(reopened.getRound(round.id).candidates[0]?.feedback).toMatchObject({
      candidateId: candidate!.id,
      requestedChanges: ["Shorten lower jaw", "Increase eye contrast"],
      generalNotes: "Second-pass notes.",
    });
    reopened.close();
  });

  it("previews contact-sheet geometry, preserves the original, and confirms deterministic derived crops", async () => {
    const { service } = createTestService();
    const { creature, round } = await createRound(service);
    const original = createGridPng(40, 20, 1, 2, [
      [210, 50, 40, 255],
      [30, 80, 210, 220],
    ]);
    const preview = await service.previewContactSheet({
      creatureId: creature.id,
      roundId: round.id,
      file: { buffer: original, originalFilename: "two-up.png" },
      layout: {
        rows: 1,
        columns: 2,
        marginTop: 0,
        marginRight: 0,
        marginBottom: 0,
        marginLeft: 0,
        horizontalGap: 0,
        verticalGap: 0,
      },
    });

    expect(preview.rectangles).toEqual([
      { index: 0, row: 0, column: 0, x: 0, y: 0, width: 20, height: 20 },
      { index: 1, row: 0, column: 1, x: 20, y: 0, width: 20, height: 20 },
    ]);
    expect(await service.readContactSheetOriginal(preview.id)).toEqual(
      original,
    );

    const adjusted = await service.previewContactSheet({
      creatureId: creature.id,
      roundId: round.id,
      file: { buffer: original, originalFilename: "two-up.png" },
      layout: {
        rows: 1,
        columns: 2,
        marginTop: 0,
        marginRight: 2,
        marginBottom: 0,
        marginLeft: 2,
        horizontalGap: 0,
        verticalGap: 0,
      },
    });
    expect(adjusted.id).toBe(preview.id);
    expect(adjusted.rectangles.map((rectangle) => rectangle.x)).toEqual([
      2, 20,
    ]);

    const derived = await service.confirmContactSheet(preview.id, [1, 0]);
    expect(derived.map((candidate) => candidate.candidateNumber)).toEqual([
      1, 2,
    ]);
    expect(derived.map((candidate) => candidate.source)).toEqual([
      "CONTACT_SHEET",
      "CONTACT_SHEET",
    ]);
    expect(derived.map((candidate) => candidate.crop?.x)).toEqual([2, 20]);
    expect(await service.readContactSheetOriginal(preview.id)).toEqual(
      original,
    );
    await expect(
      service.confirmContactSheet(preview.id, [0]),
    ).rejects.toMatchObject({
      code: "CONTACT_SHEET_ALREADY_CONFIRMED",
    } satisfies Partial<AppError>);

    await service.importCandidates({
      creatureId: creature.id,
      roundId: round.id,
      source: "MANUAL",
      files: Array.from({ length: 8 }, (_, index) => ({
        buffer: createSolidPng(8, 8, [index * 20, 30, 80, 255]),
        originalFilename: `fill-${index}.png`,
      })),
    });
    const overflow = await service.previewContactSheet({
      creatureId: creature.id,
      roundId: round.id,
      file: {
        buffer: createGridPng(20, 10, 1, 2, [
          [11, 22, 33, 255],
          [44, 55, 66, 255],
        ]),
        originalFilename: "overflow.png",
      },
      layout: {
        rows: 1,
        columns: 2,
        marginTop: 0,
        marginRight: 0,
        marginBottom: 0,
        marginLeft: 0,
        horizontalGap: 0,
        verticalGap: 0,
      },
    });
    await expect(
      service.confirmContactSheet(overflow.id, [0]),
    ).rejects.toMatchObject({
      code: "CANDIDATE_LIMIT_EXCEEDED",
      status: 409,
    } satisfies Partial<AppError>);
    expect(service.getRound(round.id).candidates).toHaveLength(10);
    service.close();
  });
});

function emptyFeedbackForTest() {
  return {
    preserveTraits: [],
    anatomyToPreserve: [],
    paletteToPreserve: [],
    silhouetteToPreserve: [],
    defects: [],
    requestedChanges: [],
    forbiddenChanges: [],
    generalNotes: "",
  };
}
