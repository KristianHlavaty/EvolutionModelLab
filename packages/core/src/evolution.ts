import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";

import {
  candidates,
  creatureProjects,
  designLocks,
  designManifests,
  evolutionMutations,
  generationRounds,
  historyEvents,
  type AppDatabase,
} from "@eml/database";
import {
  ImageInspectionError,
  inspectPng,
  type ImageLimits,
} from "@eml/image-processing";
import { buildEvolutionPrompt } from "@eml/prompt-builder";
import {
  createDescendantInputSchema,
  type CreateDescendantInput,
} from "@eml/shared";
import { and, asc, eq, isNull } from "drizzle-orm";

import type { DesignWorkflow } from "./design.js";
import { AppError } from "./errors.js";
import {
  assertPathWithin,
  fromRepositoryRelative,
  resolveWithin,
} from "./paths.js";

type CreatureRow = typeof creatureProjects.$inferSelect;
type ManifestRow = typeof designManifests.$inferSelect;

export interface EvolutionMutationView {
  id: string;
  childCreatureId: string;
  parentCreatureId: string;
  category: string;
  description: string;
  sortOrder: number;
  intensity: number | null;
  inherited: boolean;
  createdAt: string;
}

export interface EvolutionNodeView {
  id: string;
  slug: string;
  displayName: string;
  scientificName: string | null;
  parentCreatureId: string | null;
  parentDisplayName: string | null;
  evolutionaryGeneration: number;
  status: string;
  locked: boolean;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  candidateNumber: number | null;
  childCount: number;
  updatedAt: string;
}

export interface EvolutionTreeView {
  roots: string[];
  nodes: EvolutionNodeView[];
}

export interface EvolutionContextView {
  creature: EvolutionNodeView;
  parent: EvolutionNodeView | null;
  children: EvolutionNodeView[];
  mutations: EvolutionMutationView[];
  inheritedTraits: string[];
  preferredTraits: string[];
  forbiddenTraits: string[];
  canCreateDescendant: boolean;
  comparison: {
    parent: EvolutionNodeView;
    child: EvolutionNodeView;
  } | null;
}

function timestamp(): string {
  return new Date().toISOString();
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "creature";
}

function parseList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return false;
    throw error;
  }
}

export class EvolutionWorkflow {
  constructor(
    private readonly db: AppDatabase,
    private readonly repositoryRoot: string,
    private readonly workspaceRoot: string,
    private readonly limits: ImageLimits,
    private readonly design: DesignWorkflow,
  ) {}

  private creature(creatureId: string): CreatureRow {
    const creature = this.db
      .select()
      .from(creatureProjects)
      .where(
        and(
          eq(creatureProjects.id, creatureId),
          isNull(creatureProjects.deletedAt),
        ),
      )
      .get();
    if (!creature)
      throw new AppError("CREATURE_NOT_FOUND", "Creature not found.", 404);
    return creature;
  }

  private manifest(creatureId: string): ManifestRow {
    const manifest = this.db
      .select()
      .from(designManifests)
      .where(eq(designManifests.creatureProjectId, creatureId))
      .get();
    if (!manifest)
      throw new AppError(
        "MANIFEST_NOT_FOUND",
        "The creature design manifest is missing.",
        500,
      );
    return manifest;
  }

  private node(creature: CreatureRow, all: CreatureRow[]): EvolutionNodeView {
    const parent = creature.parentCreatureId
      ? all.find((item) => item.id === creature.parentCreatureId)
      : undefined;
    const lockedCandidate = creature.lockedCandidateId
      ? this.db
          .select()
          .from(candidates)
          .where(eq(candidates.id, creature.lockedCandidateId))
          .get()
      : undefined;
    const selectedCandidate =
      !lockedCandidate && creature.currentRoundId
        ? this.db
            .select()
            .from(candidates)
            .where(
              and(
                eq(candidates.generationRoundId, creature.currentRoundId),
                eq(candidates.selected, true),
                isNull(candidates.deletedAt),
              ),
            )
            .get()
        : undefined;
    const candidate = lockedCandidate ?? selectedCandidate;
    return {
      id: creature.id,
      slug: creature.slug,
      displayName: creature.displayName,
      scientificName: creature.scientificName,
      parentCreatureId: creature.parentCreatureId,
      parentDisplayName: parent?.displayName ?? null,
      evolutionaryGeneration: creature.evolutionaryGeneration ?? 0,
      status: creature.status,
      locked: Boolean(creature.lockedCandidateId),
      imageUrl: creature.lockedCandidateId
        ? `/api/creatures/${creature.id}/locked-design`
        : candidate
          ? `/api/candidates/${candidate.id}/image`
          : null,
      thumbnailUrl: candidate
        ? `/api/candidates/${candidate.id}/thumbnail`
        : null,
      candidateNumber: candidate?.candidateNumber ?? null,
      childCount: all.filter((item) => item.parentCreatureId === creature.id)
        .length,
      updatedAt: creature.updatedAt,
    };
  }

  getTree(): EvolutionTreeView {
    const creatures = this.db
      .select()
      .from(creatureProjects)
      .where(isNull(creatureProjects.deletedAt))
      .orderBy(asc(creatureProjects.createdAt))
      .all();
    return {
      roots: creatures
        .filter(
          (creature) =>
            !creature.parentCreatureId ||
            !creatures.some((item) => item.id === creature.parentCreatureId),
        )
        .map((creature) => creature.id),
      nodes: creatures.map((creature) => this.node(creature, creatures)),
    };
  }

  getContext(creatureId: string): EvolutionContextView {
    const creature = this.creature(creatureId);
    const tree = this.getTree();
    const creatureNode = tree.nodes.find((node) => node.id === creatureId)!;
    const parent = creature.parentCreatureId
      ? (tree.nodes.find((node) => node.id === creature.parentCreatureId) ??
        null)
      : null;
    const parentManifest = parent ? this.manifest(parent.id) : null;
    const mutations = this.db
      .select()
      .from(evolutionMutations)
      .where(eq(evolutionMutations.childCreatureId, creatureId))
      .orderBy(asc(evolutionMutations.sortOrder))
      .all();
    return {
      creature: creatureNode,
      parent,
      children: tree.nodes.filter(
        (node) => node.parentCreatureId === creatureId,
      ),
      mutations: mutations.map((mutation) => ({ ...mutation })),
      inheritedTraits: parentManifest
        ? parseList(parentManifest.immutableFeatures)
        : [],
      preferredTraits: parentManifest
        ? parseList(parentManifest.preferredFeatures)
        : [],
      forbiddenTraits: parentManifest
        ? parseList(parentManifest.forbiddenFeatures)
        : [],
      canCreateDescendant: creatureNode.locked,
      comparison: parent ? { parent, child: creatureNode } : null,
    };
  }

  async createDescendant(
    parentCreatureId: string,
    input: CreateDescendantInput,
  ): Promise<{ creatureId: string; roundId: string }> {
    const parsed = createDescendantInputSchema.parse(input);
    const parent = this.creature(parentCreatureId);
    if (!parent.lockedCandidateId) {
      throw new AppError(
        "APPROVED_PARENT_REQUIRED",
        "Lock the parent creature design before creating an evolutionary descendant.",
        409,
      );
    }
    const activeLock = this.db
      .select()
      .from(designLocks)
      .where(
        and(
          eq(designLocks.creatureProjectId, parent.id),
          eq(designLocks.status, "ACTIVE"),
        ),
      )
      .get();
    if (!activeLock || activeLock.candidateId !== parent.lockedCandidateId) {
      throw new AppError(
        "APPROVED_PARENT_REQUIRED",
        "The parent must have one active authoritative design lock.",
        409,
      );
    }
    const lockedCandidate = this.db
      .select()
      .from(candidates)
      .where(eq(candidates.id, activeLock.candidateId))
      .get();
    if (!lockedCandidate) {
      throw new AppError(
        "LOCKED_CANDIDATE_MISSING",
        "The parent locked candidate record is missing.",
        409,
      );
    }
    const lockedReferencePath = fromRepositoryRelative(
      this.repositoryRoot,
      activeLock.activeReferencePath,
    );
    assertPathWithin(this.workspaceRoot, lockedReferencePath);
    let lockedBytes: Buffer;
    try {
      lockedBytes = await readFile(lockedReferencePath);
    } catch {
      throw new AppError(
        "LOCKED_REFERENCE_MISSING",
        "The parent locked-reference file is missing.",
        409,
      );
    }
    let lockedInspection: Awaited<ReturnType<typeof inspectPng>>;
    try {
      lockedInspection = await inspectPng(lockedBytes, this.limits);
    } catch (cause) {
      if (cause instanceof ImageInspectionError) {
        throw new AppError(
          "LOCKED_REFERENCE_INVALID",
          `The parent locked-reference file is invalid: ${cause.message}`,
          409,
        );
      }
      throw cause;
    }
    if (lockedInspection.fileHash !== activeLock.sourceFileHash) {
      throw new AppError(
        "LOCKED_REFERENCE_MISMATCH",
        "The parent locked-reference bytes no longer match its lock record.",
        409,
      );
    }

    const parentManifest = this.manifest(parent.id);
    const inheritedTraits = parseList(parentManifest.immutableFeatures);
    const preferredTraits = parseList(parentManifest.preferredFeatures);
    const forbiddenTraits = parseList(parentManifest.forbiddenFeatures);
    const generation = (parent.evolutionaryGeneration ?? 0) + 1;
    const childId = randomUUID();
    const roundId = randomUUID();
    const createdAt = timestamp();
    const initialManifest = this.design.buildInitialManifest(
      childId,
      createdAt,
    );
    const baseSlug = slugify(parsed.displayName);
    let slug = baseSlug;
    let suffix = 2;
    let childRoot = resolveWithin(this.workspaceRoot, "creatures", slug);
    while (
      this.db
        .select({ id: creatureProjects.id })
        .from(creatureProjects)
        .where(eq(creatureProjects.slug, slug))
        .get() ||
      (await pathExists(childRoot))
    ) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
      childRoot = resolveWithin(this.workspaceRoot, "creatures", slug);
    }
    const roundRoot = resolveWithin(childRoot, "rounds", "round-001-evolution");
    const prompt = buildEvolutionPrompt({
      displayName: parsed.displayName,
      scientificName: parsed.scientificName ?? null,
      generationBrief: parsed.generationBrief,
      evolutionaryGeneration: generation,
      parent: {
        id: parent.id,
        displayName: parent.displayName,
        scientificName: parent.scientificName,
        lockedCandidateId: lockedCandidate.id,
        lockedCandidateNumber: lockedCandidate.candidateNumber,
      },
      inheritedTraits,
      preferredTraits,
      forbiddenTraits,
      mutations: parsed.mutations,
      constraints: {
        camera:
          parentManifest.cameraNotes ||
          "consistent orthographic side-view game camera",
        facing: parentManifest.facing,
        canvasWidth: parentManifest.canvasWidth,
        canvasHeight: parentManifest.canvasHeight,
        transparency: parentManifest.transparentBackgroundRequired,
        lighting:
          parentManifest.lightingNotes || "consistent neutral studio lighting",
        style:
          parentManifest.styleNotes || "match the approved ancestor design",
      },
      candidateCount: 10,
    });

    let rootCreated = false;
    try {
      await mkdir(childRoot);
      rootCreated = true;
      await Promise.all([
        mkdir(resolveWithin(childRoot, "history")),
        mkdir(resolveWithin(childRoot, "references")),
        mkdir(resolveWithin(childRoot, "animations")),
        mkdir(resolveWithin(childRoot, "exports")),
        mkdir(resolveWithin(roundRoot, "candidates"), { recursive: true }),
        mkdir(resolveWithin(roundRoot, "source-contact-sheets"), {
          recursive: true,
        }),
        mkdir(resolveWithin(roundRoot, "thumbnails"), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(
          resolveWithin(childRoot, "manifest.json"),
          initialManifest.serialized,
          { encoding: "utf8", flag: "wx" },
        ),
        writeFile(resolveWithin(roundRoot, "prompt.txt"), `${prompt}\n`, {
          encoding: "utf8",
          flag: "wx",
        }),
        writeFile(
          resolveWithin(roundRoot, "generation-context.json"),
          `${JSON.stringify(
            {
              schemaVersion: 4,
              creatureId: childId,
              roundId,
              roundNumber: 1,
              roundType: "EVOLUTION",
              workflowState: "CONCEPT",
              evolutionaryGeneration: generation,
              sourceCreature: {
                id: parent.id,
                lockedCandidateId: lockedCandidate.id,
                lockedReferencePath: activeLock.activeReferencePath,
                manifestVersion: activeLock.manifestVersion,
              },
              inheritedTraits,
              preferredTraits,
              forbiddenTraits,
              mutations: parsed.mutations,
              expectedCandidateCount: 10,
              createdAt,
            },
            null,
            2,
          )}\n`,
          { encoding: "utf8", flag: "wx" },
        ),
      ]);

      this.db.transaction((tx) => {
        tx.insert(creatureProjects)
          .values({
            id: childId,
            slug,
            displayName: parsed.displayName,
            scientificName: parsed.scientificName ?? null,
            description: parsed.description,
            generationBrief: parsed.generationBrief,
            status: "CONCEPT",
            parentCreatureId: parent.id,
            evolutionaryGeneration: generation,
            currentRoundId: roundId,
            createdAt,
            updatedAt: createdAt,
          })
          .run();
        tx.insert(designManifests).values(initialManifest.row).run();
        tx.insert(generationRounds)
          .values({
            id: roundId,
            creatureProjectId: childId,
            roundNumber: 1,
            roundType: "EVOLUTION",
            parentCandidateId: lockedCandidate.id,
            sourceCreatureId: parent.id,
            generatedPrompt: prompt,
            createdAt,
          })
          .run();
        tx.insert(evolutionMutations)
          .values(
            parsed.mutations.map((mutation, index) => ({
              id: randomUUID(),
              childCreatureId: childId,
              parentCreatureId: parent.id,
              category: mutation.category,
              description: mutation.description,
              sortOrder: index,
              intensity: mutation.intensity ?? null,
              inherited: mutation.inherited,
              createdAt,
            })),
          )
          .run();
        tx.insert(historyEvents)
          .values([
            {
              id: randomUUID(),
              creatureProjectId: childId,
              entityType: "CreatureProject",
              entityId: childId,
              action: "PROJECT_CREATED",
              payload: JSON.stringify({
                displayName: parsed.displayName,
                slug,
                source: "EVOLUTION",
              }),
              actor: parsed.actor,
              createdAt,
            },
            {
              id: randomUUID(),
              creatureProjectId: childId,
              entityType: "DesignManifest",
              entityId: initialManifest.row.id,
              action: "MANIFEST_CREATED",
              payload: JSON.stringify({ source: "PROJECT_DEFAULTS" }),
              manifestVersion: 0,
              actor: "SYSTEM",
              createdAt,
            },
            {
              id: randomUUID(),
              creatureProjectId: childId,
              entityType: "CreatureProject",
              entityId: childId,
              action: "DESCENDANT_CREATED",
              payload: JSON.stringify({
                parentCreatureId: parent.id,
                evolutionaryGeneration: generation,
                mutationCount: parsed.mutations.length,
              }),
              candidateId: lockedCandidate.id,
              generationRoundId: roundId,
              actor: parsed.actor,
              createdAt,
            },
            {
              id: randomUUID(),
              creatureProjectId: parent.id,
              entityType: "CreatureProject",
              entityId: childId,
              action: "DESCENDANT_CREATED",
              payload: JSON.stringify({
                childCreatureId: childId,
                evolutionaryGeneration: generation,
              }),
              candidateId: lockedCandidate.id,
              actor: parsed.actor,
              createdAt,
            },
            {
              id: randomUUID(),
              creatureProjectId: childId,
              entityType: "GenerationRound",
              entityId: roundId,
              action: "EVOLUTION_ROUND_CREATED",
              payload: JSON.stringify({
                roundNumber: 1,
                sourceCreatureId: parent.id,
                parentCandidateId: lockedCandidate.id,
              }),
              candidateId: lockedCandidate.id,
              generationRoundId: roundId,
              actor: parsed.actor,
              createdAt,
            },
          ])
          .run();
        tx.insert(historyEvents)
          .values(
            parsed.mutations.map((mutation) => ({
              id: randomUUID(),
              creatureProjectId: childId,
              entityType: "EvolutionMutation",
              entityId: childId,
              action: "MUTATION_ADDED",
              payload: JSON.stringify(mutation),
              actor: parsed.actor,
              createdAt,
            })),
          )
          .run();
        tx.update(creatureProjects)
          .set({ updatedAt: createdAt })
          .where(eq(creatureProjects.id, parent.id))
          .run();
      });
    } catch (error) {
      if (rootCreated) await rm(childRoot, { recursive: true, force: true });
      if (error instanceof AppError) throw error;
      throw new AppError(
        "DESCENDANT_CREATE_FAILED",
        "The descendant could not be created; staged files were removed.",
        500,
      );
    }
    return { creatureId: childId, roundId };
  }
}
