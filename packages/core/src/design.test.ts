import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createSolidPng } from "../../test-fixtures/src/png.js";
import { afterEach, describe, expect, it } from "vitest";

import type { AppError } from "./errors.js";
import { EvolutionModelLabService } from "./service.js";

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
const cleanupRoots: string[] = [];

function testService(): {
  service: EvolutionModelLabService;
  testRoot: string;
  relativeRoot: string;
} {
  const testRoot = resolve(repositoryRoot, ".tmp", "tests", randomUUID());
  const relativeRoot = testRoot
    .slice(repositoryRoot.length + 1)
    .replaceAll("\\", "/");
  cleanupRoots.push(testRoot);
  return {
    testRoot,
    relativeRoot,
    service: new EvolutionModelLabService({
      repositoryRoot,
      databasePath: `${relativeRoot}/data/app.db`,
      workspacePath: `${relativeRoot}/workspace`,
      exportsPath: `${relativeRoot}/exports`,
    }),
  };
}

async function creatureWithCandidates(
  service: EvolutionModelLabService,
  name = "Acanthostega",
) {
  const creature = await service.createCreature({
    displayName: name,
    scientificName: "Acanthostega gunnari",
    description: "Milestone 3 lock fixture.",
    generationBrief: "A grounded side-view early tetrapod design.",
  });
  const round = await service.createConceptRound(creature.id);
  const bytes = [
    createSolidPng(18, 14, [42, 90, 118, 220]),
    createSolidPng(18, 14, [118, 76, 42, 255]),
    createSolidPng(18, 14, [70, 118, 48, 230]),
  ];
  const candidates = await service.importCandidates({
    creatureId: creature.id,
    roundId: round.id,
    source: "MANUAL",
    files: bytes.map((buffer, index) => ({
      buffer,
      originalFilename: `candidate-${index + 1}.png`,
    })),
  });
  return { creature, round, candidates, bytes };
}

function manifestInput(
  manifest: Awaited<ReturnType<EvolutionModelLabService["getDesignManifest"]>>,
  overrides: Partial<
    Parameters<EvolutionModelLabService["saveDesignManifest"]>[1]
  > = {},
): Parameters<EvolutionModelLabService["saveDesignManifest"]>[1] {
  return {
    immutableFeatures: manifest.immutableFeatures,
    preferredFeatures: manifest.preferredFeatures,
    forbiddenFeatures: manifest.forbiddenFeatures,
    anatomyNotes: manifest.anatomyNotes,
    biologicalNotes: manifest.biologicalNotes,
    styleNotes: manifest.styleNotes,
    paletteNotes: manifest.paletteNotes,
    textureNotes: manifest.textureNotes,
    cameraNotes: manifest.cameraNotes,
    lightingNotes: manifest.lightingNotes,
    animationNotes: manifest.animationNotes,
    canvasWidth: manifest.canvasWidth,
    canvasHeight: manifest.canvasHeight,
    facing: manifest.facing,
    anchorX: manifest.anchorX,
    anchorY: manifest.anchorY,
    transparentBackgroundRequired: manifest.transparentBackgroundRequired,
    explicitFields: manifest.explicitFields,
    confirmedLockedMismatch: false,
    actor: "TEST_USER",
    ...overrides,
  };
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

describe("Milestone 3 design manifest and lock workflow", () => {
  it("persists ordered manifest fields, distinguishes defaults, and validates anchors", async () => {
    const { service, relativeRoot } = testService();
    const { creature } = await creatureWithCandidates(service);
    const initial = await service.getDesignManifest(creature.id);
    expect(initial).toMatchObject({
      version: 0,
      anatomyNotes: "",
      biologicalNotes: "",
      canvasWidth: 1024,
      canvasHeight: 1024,
      explicitFields: [],
    });

    const saved = await service.saveDesignManifest(
      creature.id,
      manifestInput(initial, {
        immutableFeatures: ["Wide skull", "Eight digits", "Low silhouette"],
        preferredFeatures: ["Muted olive dorsal colour", "Soft belly contrast"],
        forbiddenFeatures: ["No horns", "No mammalian fur"],
        anatomyNotes: "Preserve the approved broad cranial proportions.",
        canvasWidth: 1280,
        canvasHeight: 720,
        anchorX: 640,
        anchorY: 690,
        facing: "left",
        transparentBackgroundRequired: true,
        explicitFields: [
          "immutableFeatures",
          "preferredFeatures",
          "forbiddenFeatures",
          "anatomyNotes",
          "canvasWidth",
          "canvasHeight",
          "anchorX",
          "anchorY",
          "facing",
          "transparentBackgroundRequired",
        ],
      }),
    );
    expect(saved.immutableFeatures).toEqual([
      "Wide skull",
      "Eight digits",
      "Low silhouette",
    ]);
    expect(saved.version).toBe(0);
    await expect(
      service.saveDesignManifest(
        creature.id,
        manifestInput(saved, { anchorX: 1280 }),
      ),
    ).rejects.toThrow();
    service.close();

    const reopened = new EvolutionModelLabService({
      repositoryRoot,
      databasePath: `${relativeRoot}/data/app.db`,
      workspacePath: `${relativeRoot}/workspace`,
      exportsPath: `${relativeRoot}/exports`,
    });
    expect(
      (await reopened.getDesignManifest(creature.id)).immutableFeatures,
    ).toEqual(["Wide skull", "Eight digits", "Low silhouette"]);
    const currentFile = JSON.parse(
      await readFile(
        resolve(
          reopened.workspaceRoot,
          "creatures",
          creature.slug,
          "manifest.json",
        ),
        "utf8",
      ),
    ) as { version: number; biologicalNotes: string; explicitFields: string[] };
    expect(currentFile).toMatchObject({
      version: 0,
      biologicalNotes: "",
      explicitFields: expect.arrayContaining(["immutableFeatures", "facing"]),
    });
    reopened.close();
  });

  it("requires confirmation and a selected, valid candidate belonging to the creature", async () => {
    const { service } = testService();
    const first = await creatureWithCandidates(service, "First creature");
    const second = await creatureWithCandidates(service, "Second creature");

    await expect(
      service.lockDesign(first.creature.id, {
        candidateId: first.candidates[0]!.id,
        confirmed: false,
        actor: "TEST_USER",
      }),
    ).rejects.toMatchObject({
      code: "DESIGN_LOCK_CONFIRMATION_REQUIRED",
    } satisfies Partial<AppError>);
    await expect(
      service.lockDesign(first.creature.id, {
        candidateId: first.candidates[0]!.id,
        confirmed: true,
        actor: "TEST_USER",
      }),
    ).rejects.toMatchObject({
      code: "LOCK_SELECTED_CANDIDATE_REQUIRED",
    } satisfies Partial<AppError>);

    service.selectCandidate(second.round.id, second.candidates[0]!.id);
    await expect(
      service.lockDesign(first.creature.id, {
        candidateId: second.candidates[0]!.id,
        confirmed: true,
        actor: "TEST_USER",
      }),
    ).rejects.toMatchObject({
      code: "CANDIDATE_WRONG_CREATURE",
    } satisfies Partial<AppError>);

    service.setCandidateRejected(first.candidates[1]!.id, true);
    await expect(
      service.lockDesign(first.creature.id, {
        candidateId: first.candidates[1]!.id,
        confirmed: true,
        actor: "TEST_USER",
      }),
    ).rejects.toMatchObject({
      code: "CANDIDATE_REJECTED",
    } satisfies Partial<AppError>);
    service.deleteCandidate(first.candidates[2]!.id, true);
    await expect(
      service.lockDesign(first.creature.id, {
        candidateId: first.candidates[2]!.id,
        confirmed: true,
        actor: "TEST_USER",
      }),
    ).rejects.toMatchObject({
      code: "CANDIDATE_DELETED",
    } satisfies Partial<AppError>);
    service.close();
  });

  it("locks atomically, preserves source bytes, records history, and protects the authority", async () => {
    const { service } = testService();
    const { creature, round, candidates, bytes } =
      await creatureWithCandidates(service);
    service.selectCandidate(round.id, candidates[0]!.id);
    const draft = await service.getDesignManifest(creature.id);
    await service.saveDesignManifest(
      creature.id,
      manifestInput(draft, {
        immutableFeatures: ["Broad approved skull"],
        forbiddenFeatures: ["No dorsal spikes"],
        explicitFields: ["immutableFeatures", "forbiddenFeatures"],
      }),
    );

    const overview = await service.lockDesign(creature.id, {
      candidateId: candidates[0]!.id,
      confirmed: true,
      actor: "TEST_USER",
    });
    expect(overview.activeLock).toMatchObject({
      candidateId: candidates[0]!.id,
      generationRoundId: round.id,
      manifestVersion: 1,
      status: "ACTIVE",
    });
    expect(service.getCreature(creature.id)).toMatchObject({
      status: "DESIGN_LOCKED",
      lockedCandidateId: candidates[0]!.id,
      lockedCandidate: { id: candidates[0]!.id, locked: true },
    });
    expect(await service.readCandidateOriginal(candidates[0]!.id)).toEqual(
      bytes[0],
    );
    expect(
      await readFile(
        resolve(
          service.workspaceRoot,
          "creatures",
          creature.slug,
          "references",
          "locked-design.png",
        ),
      ),
    ).toEqual(bytes[0]);
    expect(
      JSON.parse(
        await readFile(
          resolve(
            service.workspaceRoot,
            "creatures",
            creature.slug,
            "history",
            "manifests",
            "manifest-v001.json",
          ),
          "utf8",
        ),
      ),
    ).toMatchObject({
      version: 1,
      immutableFeatures: ["Broad approved skull"],
    });
    const actions = service
      .getDesignHistory(creature.id)
      .map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "MANIFEST_CREATED",
        "MANIFEST_UPDATED",
        "MANIFEST_VERSION_FROZEN",
        "DESIGN_LOCKED",
      ]),
    );
    expect(() =>
      service.setCandidateRejected(candidates[0]!.id, true),
    ).toThrowError(
      expect.objectContaining({ code: "LOCKED_CANDIDATE_PROTECTED" }),
    );
    expect(() => service.deleteCandidate(candidates[0]!.id, true)).toThrowError(
      expect.objectContaining({ code: "LOCKED_CANDIDATE_PROTECTED" }),
    );
    expect(() => service.deleteRound(round.id, true)).toThrowError(
      expect.objectContaining({ code: "LOCK_SOURCE_ROUND_PROTECTED" }),
    );

    await service.importCandidates({
      creatureId: creature.id,
      roundId: round.id,
      source: "MANUAL",
      files: [
        {
          buffer: createSolidPng(18, 14, [180, 30, 90, 255]),
          originalFilename: "newer-import.png",
        },
      ],
    });
    expect(service.getCreature(creature.id).lockedCandidateId).toBe(
      candidates[0]!.id,
    );
    expect(
      await readFile(
        resolve(
          service.workspaceRoot,
          "creatures",
          creature.slug,
          "references",
          "locked-design.png",
        ),
      ),
    ).toEqual(bytes[0]);
    service.close();
  });

  it("keeps the lock snapshot frozen across confirmed edits, unlocks explicitly, and archives on relock", async () => {
    const { service } = testService();
    const { creature, round, candidates, bytes } =
      await creatureWithCandidates(service);
    service.selectCandidate(round.id, candidates[0]!.id);
    await service.lockDesign(creature.id, {
      candidateId: candidates[0]!.id,
      confirmed: true,
      actor: "TEST_USER",
    });
    const lockedV1 = await readFile(
      resolve(
        service.workspaceRoot,
        "creatures",
        creature.slug,
        "history",
        "manifests",
        "manifest-v001.json",
      ),
    );
    const current = await service.getDesignManifest(creature.id);
    await expect(
      service.saveDesignManifest(
        creature.id,
        manifestInput(current, {
          styleNotes: "A newly confirmed style direction.",
        }),
      ),
    ).rejects.toMatchObject({
      code: "MANIFEST_LOCK_CONFIRMATION_REQUIRED",
    } satisfies Partial<AppError>);
    const edited = await service.saveDesignManifest(
      creature.id,
      manifestInput(current, {
        styleNotes: "A newly confirmed style direction.",
        explicitFields: ["styleNotes"],
        confirmedLockedMismatch: true,
      }),
    );
    expect(edited.version).toBe(2);
    expect(edited.lockedSnapshotVersion).toBe(1);
    expect(
      await readFile(
        resolve(
          service.workspaceRoot,
          "creatures",
          creature.slug,
          "history",
          "manifests",
          "manifest-v001.json",
        ),
      ),
    ).toEqual(lockedV1);
    expect(
      JSON.parse(
        await readFile(
          resolve(
            service.workspaceRoot,
            "creatures",
            creature.slug,
            "history",
            "manifests",
            "manifest-v002.json",
          ),
          "utf8",
        ),
      ),
    ).toMatchObject({
      version: 2,
      styleNotes: "A newly confirmed style direction.",
    });

    expect(() =>
      service.unlockDesign(creature.id, {
        confirmed: false,
        actor: "TEST_USER",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "DESIGN_UNLOCK_CONFIRMATION_REQUIRED" }),
    );
    service.unlockDesign(creature.id, { confirmed: true, actor: "TEST_USER" });
    expect(service.getCreature(creature.id)).toMatchObject({
      status: "REFINING",
      lockedCandidateId: null,
    });
    expect(
      await readFile(
        resolve(
          service.workspaceRoot,
          "creatures",
          creature.slug,
          "references",
          "locked-design.png",
        ),
      ),
    ).toEqual(bytes[0]);

    service.selectCandidate(round.id, candidates[1]!.id);
    const relocked = await service.lockDesign(creature.id, {
      candidateId: candidates[1]!.id,
      confirmed: true,
      actor: "TEST_USER",
    });
    expect(relocked.activeLock).toMatchObject({
      lockNumber: 2,
      candidateId: candidates[1]!.id,
      manifestVersion: 3,
    });
    expect(
      await readFile(
        resolve(
          service.workspaceRoot,
          "creatures",
          creature.slug,
          "history",
          "locked-designs",
          "locked-design-v001.png",
        ),
      ),
    ).toEqual(bytes[0]);
    expect(
      await readFile(
        resolve(
          service.workspaceRoot,
          "creatures",
          creature.slug,
          "references",
          "locked-design.png",
        ),
      ),
    ).toEqual(bytes[1]);
    expect(relocked.lockHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lockNumber: 1, status: "SUPERSEDED" }),
        expect.objectContaining({ lockNumber: 2, status: "ACTIVE" }),
      ]),
    );
    service.close();
  });

  it("rolls back lock state when a historical destination or active reference exists unexpectedly", async () => {
    const { service } = testService();
    const first = await creatureWithCandidates(service, "Snapshot collision");
    service.selectCandidate(first.round.id, first.candidates[0]!.id);
    const snapshotPath = resolve(
      service.workspaceRoot,
      "creatures",
      first.creature.slug,
      "history",
      "manifests",
      "manifest-v001.json",
    );
    await mkdir(resolve(snapshotPath, ".."), { recursive: true });
    await writeFile(snapshotPath, "do not overwrite");
    await expect(
      service.lockDesign(first.creature.id, {
        candidateId: first.candidates[0]!.id,
        confirmed: true,
        actor: "TEST_USER",
      }),
    ).rejects.toMatchObject({
      code: "LOCK_DESTINATION_EXISTS",
    } satisfies Partial<AppError>);
    expect(service.getCreature(first.creature.id)).toMatchObject({
      status: "CANDIDATE_SELECTED",
      lockedCandidateId: null,
      activeLock: null,
    });
    expect(await readFile(snapshotPath, "utf8")).toBe("do not overwrite");

    const second = await creatureWithCandidates(service, "Reference collision");
    service.selectCandidate(second.round.id, second.candidates[0]!.id);
    const activePath = resolve(
      service.workspaceRoot,
      "creatures",
      second.creature.slug,
      "references",
      "locked-design.png",
    );
    await writeFile(activePath, "unexpected existing bytes");
    await expect(
      service.lockDesign(second.creature.id, {
        candidateId: second.candidates[0]!.id,
        confirmed: true,
        actor: "TEST_USER",
      }),
    ).rejects.toMatchObject({
      code: "ACTIVE_LOCKED_DESIGN_EXISTS",
    } satisfies Partial<AppError>);
    expect(await readFile(activePath, "utf8")).toBe(
      "unexpected existing bytes",
    );
    expect(
      service.getCreature(second.creature.id).lockedCandidateId,
    ).toBeNull();
    service.close();
  });
});
