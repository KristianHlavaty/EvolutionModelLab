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

async function createCandidateCreature(
  service: EvolutionModelLabService,
  name: string,
) {
  const creature = await service.createCreature({
    displayName: name,
    scientificName: `${name} testii`,
    description: "Evolution workflow fixture.",
    generationBrief: "A grounded side-view creature with readable anatomy.",
  });
  const round = await service.createConceptRound(creature.id);
  const bytes = createSolidPng(24, 16, [62, 112, 144, 230]);
  const [candidate] = await service.importCandidates({
    creatureId: creature.id,
    roundId: round.id,
    source: "MANUAL",
    files: [{ buffer: bytes, originalFilename: "ancestor.png" }],
  });
  service.selectCandidate(round.id, candidate!.id);
  return { creature, round, candidate: candidate!, bytes };
}

async function lockCreature(service: EvolutionModelLabService, name: string) {
  const result = await createCandidateCreature(service, name);
  const manifest = await service.getDesignManifest(result.creature.id);
  await service.saveDesignManifest(result.creature.id, {
    immutableFeatures: ["Armoured skull", "Blade-like jaw plates"],
    preferredFeatures: ["Ochre plate edges"],
    forbiddenFeatures: ["No horns"],
    anatomyNotes: manifest.anatomyNotes,
    biologicalNotes: manifest.biologicalNotes,
    styleNotes: "Grounded painted game creature",
    paletteNotes: manifest.paletteNotes,
    textureNotes: manifest.textureNotes,
    cameraNotes: "Strict orthographic side view",
    lightingNotes: "Neutral studio lighting",
    animationNotes: manifest.animationNotes,
    canvasWidth: 1024,
    canvasHeight: 1024,
    facing: "right",
    anchorX: 512,
    anchorY: 1023,
    transparentBackgroundRequired: true,
    explicitFields: [
      "immutableFeatures",
      "preferredFeatures",
      "forbiddenFeatures",
      "styleNotes",
      "cameraNotes",
      "lightingNotes",
    ],
    confirmedLockedMismatch: false,
    actor: "TEST_USER",
  });
  await service.lockDesign(result.creature.id, {
    candidateId: result.candidate.id,
    confirmed: true,
    actor: "TEST_USER",
  });
  return result;
}

const descendantInput = {
  displayName: "Reef descendant",
  scientificName: "Testudunkleus reefii",
  description: "A shallow-water descendant.",
  generationBrief: "Adapt the approved ancestor for agile reef pursuit.",
  mutations: [
    {
      category: "LOCOMOTION" as const,
      description: "Shorter turning radius with broader steering fins",
      intensity: 3,
      inherited: false,
    },
    {
      category: "COLOUR" as const,
      description: "Reef-breaking mottled palette",
      intensity: 2,
      inherited: false,
    },
  ],
  actor: "TEST_USER",
};

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

describe("Milestone 4 evolution workflow", () => {
  it("requires one active authoritative parent lock", async () => {
    const { service } = testService();
    const parent = await createCandidateCreature(service, "Unlocked parent");
    await expect(
      service.createDescendant(parent.creature.id, descendantInput),
    ).rejects.toMatchObject({
      code: "APPROVED_PARENT_REQUIRED",
    } satisfies Partial<AppError>);

    await service.lockDesign(parent.creature.id, {
      candidateId: parent.candidate.id,
      confirmed: true,
      actor: "TEST_USER",
    });
    service.unlockDesign(parent.creature.id, {
      confirmed: true,
      actor: "TEST_USER",
    });
    await expect(
      service.createDescendant(parent.creature.id, descendantInput),
    ).rejects.toMatchObject({
      code: "APPROVED_PARENT_REQUIRED",
    } satisfies Partial<AppError>);
    service.close();
  });

  it("creates and persists an immutable evolution round, mutations, prompt, and lineage", async () => {
    const { service, options, relativeRoot } = testService();
    const parent = await lockCreature(service, "Armoured ancestor");
    const original = await service.readCandidateOriginal(parent.candidate.id);
    const child = await service.createDescendant(
      parent.creature.id,
      descendantInput,
    );

    expect(child).toMatchObject({
      parentCreatureId: parent.creature.id,
      evolutionaryGeneration: 1,
      status: "CONCEPT",
      roundCount: 1,
      currentRound: { roundNumber: 1, roundType: "EVOLUTION" },
    });
    expect(child.currentRound!.generatedPrompt).toContain(
      "Approved ancestor: Armoured ancestor",
    );
    expect(child.currentRound!.generatedPrompt).toContain("Armoured skull");
    expect(
      child.currentRound!.generatedPrompt.indexOf("Shorter turning radius"),
    ).toBeLessThan(
      child.currentRound!.generatedPrompt.indexOf("Reef-breaking mottled"),
    );
    expect(child.currentRound!.generatedPrompt).toContain(
      "Do not create an animation",
    );

    const context = service.getEvolutionContext(child.id);
    expect(context.parent?.id).toBe(parent.creature.id);
    expect(context.inheritedTraits).toEqual([
      "Armoured skull",
      "Blade-like jaw plates",
    ]);
    expect(context.mutations.map((item) => item.category)).toEqual([
      "LOCOMOTION",
      "COLOUR",
    ]);
    expect(context.comparison).toMatchObject({
      parent: { locked: true },
      child: { locked: false },
    });
    const tree = service.getEvolutionTree();
    expect(tree.roots).toContain(parent.creature.id);
    expect(
      tree.nodes.find((node) => node.id === parent.creature.id),
    ).toMatchObject({ childCount: 1, evolutionaryGeneration: 0 });
    expect(await service.readCandidateOriginal(parent.candidate.id)).toEqual(
      original,
    );

    const roundRoot = resolve(
      repositoryRoot,
      relativeRoot,
      "workspace",
      "creatures",
      child.slug,
      "rounds",
      "round-001-evolution",
    );
    expect(await readFile(resolve(roundRoot, "prompt.txt"), "utf8")).toContain(
      "Evolution Descendant Request",
    );
    expect(
      JSON.parse(
        await readFile(resolve(roundRoot, "generation-context.json"), "utf8"),
      ),
    ).toMatchObject({
      roundType: "EVOLUTION",
      sourceCreature: { id: parent.creature.id },
      evolutionaryGeneration: 1,
    });

    service.close();
    const reopened = new EvolutionModelLabService(options);
    expect(reopened.getEvolutionContext(child.id).mutations).toHaveLength(2);
    expect(reopened.getCreature(child.id).currentRound?.roundType).toBe(
      "EVOLUTION",
    );
    reopened.close();
  });

  it("supports evolution candidate imports, multiple generations, comparison, and reference-integrity checks", async () => {
    const { service } = testService();
    const parent = await lockCreature(service, "Generation zero");
    const child = await service.createDescendant(
      parent.creature.id,
      descendantInput,
    );
    const childBytes = createSolidPng(24, 16, [48, 145, 96, 225]);
    const [childCandidate] = await service.importCandidates({
      creatureId: child.id,
      roundId: child.currentRound!.id,
      source: "MANUAL",
      files: [{ buffer: childBytes, originalFilename: "child.png" }],
    });
    service.selectCandidate(child.currentRound!.id, childCandidate!.id);
    await service.lockDesign(child.id, {
      candidateId: childCandidate!.id,
      confirmed: true,
      actor: "TEST_USER",
    });
    const grandchild = await service.createDescendant(child.id, {
      ...descendantInput,
      displayName: "Generation two",
    });
    expect(grandchild.evolutionaryGeneration).toBe(2);
    expect(service.getEvolutionContext(grandchild.id).comparison).toMatchObject(
      {
        parent: { id: child.id, locked: true },
        child: { id: grandchild.id, locked: false },
      },
    );

    const activeReference = resolve(
      service.workspaceRoot,
      "creatures",
      parent.creature.slug,
      "references",
      "locked-design.png",
    );
    await writeFile(
      activeReference,
      createSolidPng(24, 16, [200, 10, 10, 255]),
    );
    await expect(
      service.createDescendant(parent.creature.id, {
        ...descendantInput,
        displayName: "Rejected mismatch",
      }),
    ).rejects.toMatchObject({
      code: "LOCKED_REFERENCE_MISMATCH",
    } satisfies Partial<AppError>);
    service.close();
  });
});
