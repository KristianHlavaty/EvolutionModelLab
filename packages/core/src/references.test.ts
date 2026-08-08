import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createSolidPng } from "../../test-fixtures/src/png.js";
import { afterEach, describe, expect, it } from "vitest";

import type { AppError } from "./errors.js";
import { EvolutionModelLabService } from "./service.js";

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
const cleanupRoots: string[] = [];

function testService() {
  const testRoot = resolve(repositoryRoot, ".tmp", "tests", randomUUID());
  const relativeRoot = testRoot
    .slice(repositoryRoot.length + 1)
    .replaceAll("\\", "/");
  cleanupRoots.push(testRoot);
  const options = {
    repositoryRoot,
    databasePath: `${relativeRoot}/data/app.db`,
    workspacePath: `${relativeRoot}/workspace`,
    exportsPath: `${relativeRoot}/exports`,
  };
  return {
    testRoot,
    relativeRoot,
    options,
    service: new EvolutionModelLabService(options),
  };
}

async function lockedCreature(
  service: EvolutionModelLabService,
  name = "Reference creature",
) {
  const creature = await service.createCreature({
    displayName: name,
    scientificName: "Referentia testii",
    description: "Reference workflow fixture.",
    generationBrief: "Grounded side-view creature with a readable silhouette.",
  });
  const round = await service.createConceptRound(creature.id);
  const lockedBytes = createSolidPng(32, 20, [54, 112, 172, 225]);
  const replacementBytes = createSolidPng(32, 20, [184, 105, 44, 230]);
  const imported = await service.importCandidates({
    creatureId: creature.id,
    roundId: round.id,
    source: "MANUAL",
    files: [
      { buffer: lockedBytes, originalFilename: "locked.png" },
      { buffer: replacementBytes, originalFilename: "replacement.png" },
    ],
  });
  service.selectCandidate(round.id, imported[0]!.id);
  const manifest = await service.getDesignManifest(creature.id);
  await service.saveDesignManifest(creature.id, {
    immutableFeatures: ["Broad low skull"],
    preferredFeatures: ["Muted ochre armour"],
    forbiddenFeatures: ["No horns"],
    anatomyNotes: "Keep the approved plate boundaries.",
    biologicalNotes: manifest.biologicalNotes,
    styleNotes: "Grounded painted game creature",
    paletteNotes: "Muted ochre and charcoal",
    textureNotes: "Weathered plate armour",
    cameraNotes: "Strict orthographic presentation",
    lightingNotes: "Neutral studio lighting",
    animationNotes: manifest.animationNotes,
    canvasWidth: 32,
    canvasHeight: 20,
    facing: "right",
    anchorX: 16,
    anchorY: 19,
    transparentBackgroundRequired: true,
    explicitFields: [
      "immutableFeatures",
      "preferredFeatures",
      "forbiddenFeatures",
      "anatomyNotes",
      "styleNotes",
      "paletteNotes",
      "textureNotes",
      "cameraNotes",
      "lightingNotes",
      "canvasWidth",
      "canvasHeight",
    ],
    confirmedLockedMismatch: false,
    actor: "TEST_USER",
  });
  await service.lockDesign(creature.id, {
    candidateId: imported[0]!.id,
    confirmed: true,
    actor: "TEST_USER",
  });
  return {
    creature,
    round,
    lockedCandidate: imported[0]!,
    replacementCandidate: imported[1]!,
    lockedBytes,
  };
}

async function importAndApprove(
  service: EvolutionModelLabService,
  creatureId: string,
  referenceType: "SIDE_PROFILE" | "SILHOUETTE" | "COLOUR_MATERIAL" | "FRONT",
  colour: [number, number, number, number],
) {
  const request = await service.createReference(creatureId, {
    referenceType,
    notes: `${referenceType} request`,
    actor: "TEST_USER",
  });
  const bytes = createSolidPng(32, 20, colour);
  const imported = await service.importReference(
    request.id,
    { buffer: bytes, originalFilename: `${referenceType}.png` },
    `${referenceType} imported`,
    "TEST_USER",
  );
  const approved = await service.approveReference(request.id, {
    confirmed: true,
    notes: `${referenceType} approved`,
    actor: "TEST_USER",
  });
  return { request, imported, approved, bytes };
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

describe("Milestone 5 canonical reference workflow", () => {
  it("requires a current design lock and preserves an immutable request prompt", async () => {
    const { service, relativeRoot } = testService();
    const unlocked = await service.createCreature({
      displayName: "Unlocked reference source",
      generationBrief: "A readable test creature.",
    });
    await expect(
      service.createReference(unlocked.id, {
        referenceType: "SIDE_PROFILE",
        notes: "",
        actor: "TEST_USER",
      }),
    ).rejects.toMatchObject({
      code: "DESIGN_LOCK_REQUIRED",
    } satisfies Partial<AppError>);

    const locked = await lockedCreature(service, "Prompt source");
    const requested = await service.createReference(locked.creature.id, {
      referenceType: "SIDE_PROFILE",
      notes: "Strict identity study.",
      actor: "TEST_USER",
    });
    expect(requested.status).toBe("REQUESTED");
    expect(requested.generatedPrompt).toContain(
      "Create exactly one strict side profile",
    );
    expect(requested.generatedPrompt).toContain("Broad low skull");
    expect(requested.generatedPrompt).toContain("Do not redesign");
    const promptPath = resolve(
      repositoryRoot,
      relativeRoot,
      "workspace",
      "creatures",
      locked.creature.slug,
      "references",
      "side-profile",
      requested.id,
      "prompt.txt",
    );
    expect(await readFile(promptPath, "utf8")).toBe(requested.generatedPrompt);
    await expect(
      service.createReference(locked.creature.id, {
        referenceType: "SIDE_PROFILE",
        notes: "Duplicate pending request",
        actor: "TEST_USER",
      }),
    ).rejects.toMatchObject({
      code: "REFERENCE_REQUEST_PENDING",
    } satisfies Partial<AppError>);
    expect(service.getReferenceContext(locked.creature.id)).toMatchObject({
      creature: { status: "REFERENCE_BUILDING" },
      activeLock: { candidateId: locked.lockedCandidate.id },
      missingMandatoryReferenceTypes: [
        "SIDE_PROFILE",
        "SILHOUETTE",
        "COLOUR_MATERIAL",
      ],
      animationGateSatisfied: false,
    });
    service.close();
  });

  it("validates, imports, approves, and persists all mandatory references", async () => {
    const { service, options } = testService();
    const locked = await lockedCreature(service, "Approval source");
    const side = await service.createReference(locked.creature.id, {
      referenceType: "SIDE_PROFILE",
      notes: "",
      actor: "TEST_USER",
    });
    await expect(
      service.importReference(
        side.id,
        { buffer: Buffer.from("not png"), originalFilename: "bad.png" },
        "",
        "TEST_USER",
      ),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_IMAGE",
    } satisfies Partial<AppError>);
    const sideBytes = createSolidPng(32, 20, [70, 145, 92, 220]);
    const importedSide = await service.importReference(
      side.id,
      { buffer: sideBytes, originalFilename: "side.png" },
      "Identity matches the lock.",
      "TEST_USER",
    );
    expect(importedSide.validation).toMatchObject({
      valid: true,
      warnings: [],
      checks: {
        decodedPng: true,
        transparentBackground: true,
        canvasMatchesManifest: true,
      },
    });
    const storedMedia = service.getReferenceMedia(side.id, "image");
    expect(await readFile(storedMedia.path)).toEqual(sideBytes);
    const retry = await service.createReference(locked.creature.id, {
      referenceType: "SIDE_PROFILE",
      notes: "Retry before approval",
      actor: "TEST_USER",
    });
    await expect(
      service.importReference(
        retry.id,
        { buffer: sideBytes, originalFilename: "duplicate-side.png" },
        "",
        "TEST_USER",
      ),
    ).rejects.toMatchObject({
      code: "DUPLICATE_REFERENCE",
    } satisfies Partial<AppError>);
    await expect(
      service.approveReference(side.id, {
        confirmed: false,
        actor: "TEST_USER",
      }),
    ).rejects.toMatchObject({
      code: "REFERENCE_APPROVAL_CONFIRMATION_REQUIRED",
    } satisfies Partial<AppError>);
    await service.approveReference(side.id, {
      confirmed: true,
      actor: "TEST_USER",
    });
    await importAndApprove(
      service,
      locked.creature.id,
      "SILHOUETTE",
      [20, 20, 20, 210],
    );
    await importAndApprove(
      service,
      locked.creature.id,
      "COLOUR_MATERIAL",
      [175, 115, 55, 230],
    );
    expect(service.getReferenceContext(locked.creature.id)).toMatchObject({
      creature: { status: "REFERENCE_APPROVED" },
      satisfiedReferenceTypes: [
        "LOCKED_DESIGN",
        "SIDE_PROFILE",
        "SILHOUETTE",
        "COLOUR_MATERIAL",
      ],
      missingMandatoryReferenceTypes: [],
      animationGateSatisfied: true,
    });
    expect(
      await service.readCandidateOriginal(locked.lockedCandidate.id),
    ).toEqual(locked.lockedBytes);

    service.close();
    const reopened = new EvolutionModelLabService(options);
    expect(reopened.getReferenceContext(locked.creature.id)).toMatchObject({
      animationGateSatisfied: true,
      references: expect.arrayContaining([
        expect.objectContaining({
          referenceType: "SIDE_PROFILE",
          approved: true,
        }),
      ]),
    });
    reopened.close();
  });

  it("applies project mandatory rules and makes old-lock approvals stale", async () => {
    const { service } = testService();
    const locked = await lockedCreature(service, "Settings source");
    const settings = service.updateReferenceSettings({
      requiredReferenceTypes: ["LOCKED_DESIGN", "FRONT"],
      actor: "TEST_USER",
    });
    expect(settings.requiredReferenceTypes).toEqual(["LOCKED_DESIGN", "FRONT"]);
    expect(service.getReferenceContext(locked.creature.id)).toMatchObject({
      missingMandatoryReferenceTypes: ["FRONT"],
      animationGateSatisfied: false,
    });
    await importAndApprove(
      service,
      locked.creature.id,
      "FRONT",
      [130, 80, 170, 220],
    );
    expect(service.getReferenceContext(locked.creature.id)).toMatchObject({
      missingMandatoryReferenceTypes: [],
      animationGateSatisfied: true,
    });

    service.unlockDesign(locked.creature.id, {
      confirmed: true,
      actor: "TEST_USER",
    });
    service.selectCandidate(locked.round.id, locked.replacementCandidate.id);
    await service.lockDesign(locked.creature.id, {
      candidateId: locked.replacementCandidate.id,
      confirmed: true,
      actor: "TEST_USER",
    });
    const context = service.getReferenceContext(locked.creature.id);
    expect(context).toMatchObject({
      creature: { status: "DESIGN_LOCKED" },
      satisfiedReferenceTypes: ["LOCKED_DESIGN"],
      missingMandatoryReferenceTypes: ["FRONT"],
      animationGateSatisfied: false,
    });
    expect(context.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceType: "FRONT",
          approved: true,
          currentDesign: false,
        }),
      ]),
    );

    const pending = await service.createReference(locked.creature.id, {
      referenceType: "FRONT",
      notes: "New lock request",
      actor: "TEST_USER",
    });
    const promptPath = resolve(
      service.workspaceRoot,
      "creatures",
      locked.creature.slug,
      "references",
      "front",
      pending.id,
      "prompt.txt",
    );
    await writeFile(promptPath, "tampered prompt", "utf8");
    expect(
      service
        .getReferenceContext(locked.creature.id)
        .references.find((item) => item.id === pending.id)?.generatedPrompt,
    ).toContain("Canonical Reference Request");
    service.close();
  });
});
