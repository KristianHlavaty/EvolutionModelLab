import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { createSolidPng } from "../../test-fixtures/src/png.js";
import { afterEach, describe, expect, it } from "vitest";

import type { AppError } from "./errors.js";
import { EvolutionModelLabService } from "./service.js";

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
const cleanupRoots: string[] = [];

function testService() {
  const testRoot = resolve(repositoryRoot, ".tmp", "tests", randomUUID());
  const relative = testRoot
    .slice(repositoryRoot.length + 1)
    .replaceAll("\\", "/");
  cleanupRoots.push(testRoot);
  return new EvolutionModelLabService({
    repositoryRoot,
    databasePath: `${relative}/data/app.db`,
    workspacePath: `${relative}/workspace`,
    exportsPath: `${relative}/exports`,
  });
}

async function lockFixture(service: EvolutionModelLabService) {
  const creature = await service.createCreature({
    displayName: "Animated placoderm",
    scientificName: "Motus testii",
    description: "Animation workflow fixture.",
    generationBrief: "A readable armoured swimmer.",
  });
  const round = await service.createConceptRound(creature.id);
  const lockedBytes = createSolidPng(32, 20, [40, 100, 160, 220]);
  const [candidate] = await service.importCandidates({
    creatureId: creature.id,
    roundId: round.id,
    source: "MANUAL",
    files: [{ buffer: lockedBytes, originalFilename: "locked.png" }],
  });
  service.selectCandidate(round.id, candidate!.id);
  const manifest = await service.getDesignManifest(creature.id);
  await service.saveDesignManifest(creature.id, {
    immutableFeatures: ["Broad armour plate"],
    preferredFeatures: [],
    forbiddenFeatures: ["No horns"],
    anatomyNotes: "Preserve fin placement.",
    biologicalNotes: manifest.biologicalNotes,
    styleNotes: "Grounded game art",
    paletteNotes: "Blue and ochre",
    textureNotes: "Weathered plate",
    cameraNotes: "Side view",
    lightingNotes: "Neutral",
    animationNotes: "Economical tail beat.",
    canvasWidth: 32,
    canvasHeight: 20,
    facing: "right",
    anchorX: 16,
    anchorY: 19,
    transparentBackgroundRequired: true,
    explicitFields: [
      "immutableFeatures",
      "forbiddenFeatures",
      "anatomyNotes",
      "styleNotes",
      "paletteNotes",
      "textureNotes",
      "cameraNotes",
      "lightingNotes",
      "animationNotes",
      "canvasWidth",
      "canvasHeight",
      "facing",
      "anchorX",
      "anchorY",
    ],
    confirmedLockedMismatch: false,
    actor: "TEST_USER",
  });
  await service.lockDesign(creature.id, {
    candidateId: candidate!.id,
    confirmed: true,
    actor: "TEST_USER",
  });
  return creature;
}

afterEach(async () => {
  for (const target of cleanupRoots.splice(0)) {
    const parent = resolve(repositoryRoot, ".tmp", "tests");
    if (!target.startsWith(`${parent}\\`) && !target.startsWith(`${parent}/`)) {
      throw new Error(`Refusing unsafe test cleanup: ${target}`);
    }
    await rm(target, { recursive: true, force: true });
  }
});

describe("Milestone 6 animation workflow", () => {
  it("gates animation creation and saves a deterministic key-pose handoff", async () => {
    const service = testService();
    const creature = await lockFixture(service);
    await expect(
      service.createAnimation(creature.id, {
        name: "Cruising swim",
        animationType: "SWIM",
        fps: 12,
        looping: true,
        canvasWidth: 32,
        canvasHeight: 20,
        expectedFrameCount: 2,
        actor: "TEST_USER",
      }),
    ).rejects.toMatchObject({
      code: "ANIMATION_REFERENCES_INCOMPLETE",
    } satisfies Partial<AppError>);

    service.updateReferenceSettings({
      requiredReferenceTypes: ["LOCKED_DESIGN"],
      actor: "TEST_USER",
    });
    const animation = await service.createAnimation(creature.id, {
      name: "Cruising swim",
      animationType: "SWIM",
      fps: 12,
      looping: true,
      canvasWidth: 32,
      canvasHeight: 20,
      expectedFrameCount: 2,
      actor: "TEST_USER",
    });
    expect(animation).toMatchObject({
      status: "KEY_POSES",
      currentDesign: true,
      anchor: { x: 16, y: 19 },
    });
    expect(animation.prompts[0]?.generatedPrompt).toContain(
      "2 ordered key poses",
    );
    expect(animation.prompts[0]?.generatedPrompt).toContain(
      "Do not introduce anatomy drift",
    );
    service.close();
  });

  it("imports, reviews, reorders, repairs, and approves immutable frame revisions", async () => {
    const service = testService();
    const creature = await lockFixture(service);
    service.updateReferenceSettings({
      requiredReferenceTypes: ["LOCKED_DESIGN"],
      actor: "TEST_USER",
    });
    let animation = await service.createAnimation(creature.id, {
      name: "Tail cycle",
      animationType: "SWIM",
      fps: 10,
      looping: true,
      canvasWidth: 32,
      canvasHeight: 20,
      expectedFrameCount: 2,
      actor: "TEST_USER",
    });
    const firstBytes = createSolidPng(32, 20, [40, 120, 170, 210]);
    const secondBytes = createSolidPng(32, 20, [150, 90, 45, 220]);
    animation = await service.importAnimationFrames(
      animation.id,
      [
        { buffer: firstBytes, originalFilename: "pose-01.png" },
        { buffer: secondBytes, originalFilename: "pose-02.png" },
      ],
      "KEY_POSE",
      "MANUAL",
      "TEST_USER",
    );
    expect(animation.frames).toHaveLength(2);
    expect(animation.frames[0]).toMatchObject({
      frameNumber: 1,
      width: 32,
      height: 20,
      touchesCanvasEdge: true,
      validationStatus: "WARNING",
    });
    expect(
      await readFile(
        service.getAnimationFrameMedia(animation.frames[0]!.id, "image").path,
      ),
    ).toEqual(firstBytes);
    await expect(
      service.importAnimationFrames(
        animation.id,
        [{ buffer: firstBytes, originalFilename: "duplicate.png" }],
        "INTERMEDIATE",
        "MANUAL",
        "TEST_USER",
      ),
    ).rejects.toMatchObject({
      code: "DUPLICATE_FRAME",
    } satisfies Partial<AppError>);

    animation = service.reorderAnimationFrames(animation.id, {
      frameIds: [animation.frames[1]!.id, animation.frames[0]!.id],
      actor: "TEST_USER",
    });
    expect(animation.frames.map((frame) => frame.originalFilename)).toEqual([
      "pose-02.png",
      "pose-01.png",
    ]);
    animation = await service.createIntermediateAnimationPrompt(
      animation.id,
      "TEST_USER",
    );
    expect(animation.prompts[0]?.generatedPrompt).toContain(
      "only the missing intermediate frames",
    );

    const broken = animation.frames[0]!;
    const preservedPath = service.getAnimationFrameMedia(
      broken.id,
      "image",
    ).path;
    animation = service.updateAnimationFrame(broken.id, {
      frameRole: "KEY_POSE",
      durationMs: 125,
      notes: "Lower fin is incomplete.",
      markedForRepair: true,
      actor: "TEST_USER",
    });
    animation = await service.createAnimationRepairPrompt(broken.id, {
      repairInstructions: "Restore only the lower fin.",
      actor: "TEST_USER",
    });
    expect(animation.prompts[0]?.generatedPrompt).toContain(
      "Return exactly one transparent PNG replacement",
    );
    const repairBytes = createSolidPng(32, 20, [70, 180, 95, 230]);
    animation = await service.replaceAnimationFrame(
      broken.id,
      { buffer: repairBytes, originalFilename: "repair.png" },
      "Fin restored.",
      "TEST_USER",
    );
    expect(animation.frames[0]).toMatchObject({
      frameRole: "REPAIR",
      replacesFrameId: broken.id,
      markedForRepair: false,
      durationMs: 125,
    });
    expect(await readFile(preservedPath)).toEqual(secondBytes);
    animation = service.approveAnimation(animation.id, {
      confirmed: true,
      actor: "TEST_USER",
    });
    expect(animation.status).toBe("APPROVED");
    const report = service.getValidationReport(creature.id);
    expect(report).toMatchObject({
      readyForExport: true,
      approvedAnimationCount: 1,
      referencesApproved: 0,
    });
    expect(report.warningCount).toBeGreaterThan(0);
    await expect(
      service.exportCreature(creature.id, {
        exportFormat: "GENERIC",
        includePromptHistory: true,
        confirmed: false,
        actor: "TEST_USER",
      }),
    ).rejects.toMatchObject({
      code: "CONFIRMATION_REQUIRED",
    } satisfies Partial<AppError>);
    const firstExport = await service.exportCreature(creature.id, {
      exportFormat: "GENERIC",
      includePromptHistory: true,
      confirmed: true,
      actor: "TEST_USER",
    });
    expect(firstExport).toMatchObject({
      version: 1,
      status: "COMPLETE",
      summary: {
        animationCount: 1,
        frameCount: 2,
        includePromptHistory: true,
      },
    });
    const packageRoot = resolve(repositoryRoot, firstExport.packagePath);
    const animationJsonPath = firstExport.summary.files.find((path) =>
      path.endsWith("/animation.json"),
    );
    const firstFramePath = firstExport.summary.files.find((path) =>
      path.endsWith("/frames/frame-0001.png"),
    );
    expect(
      JSON.parse(
        await readFile(resolve(packageRoot, animationJsonPath!), "utf8"),
      ),
    ).toMatchObject({
      name: "Tail cycle",
      fps: 10,
      looping: true,
      spriteSheet: { width: 64, height: 20, columns: 2, rows: 1 },
      frames: [
        { number: 1, durationMs: 125 },
        { number: 2, durationMs: 100 },
      ],
    });
    expect(await readFile(resolve(packageRoot, firstFramePath!))).toEqual(
      repairBytes,
    );
    expect(
      JSON.parse(
        await readFile(resolve(packageRoot, "validation-report.json"), "utf8"),
      ),
    ).toMatchObject({
      readyForExport: true,
      warningCount: report.warningCount,
    });
    expect(
      await readFile(resolve(packageRoot, "prompt-history.json"), "utf8"),
    ).toContain("Animation Intermediate-Frame Request");
    const secondExport = await service.exportCreature(creature.id, {
      exportFormat: "GENERIC",
      includePromptHistory: false,
      confirmed: true,
      actor: "TEST_USER",
    });
    expect(secondExport.version).toBe(2);
    expect(secondExport.packagePath).not.toBe(firstExport.packagePath);
    expect(secondExport.summary.files).not.toContain("prompt-history.json");
    expect(service.getCreature(creature.id).status).toBe("GAME_READY");
    service.close();
  });
});
