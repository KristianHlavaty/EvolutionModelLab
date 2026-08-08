import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  candidateFeedback,
  candidates,
  contactSheetImports,
  createDatabase,
  creatureProjects,
  designManifests,
  generationRounds,
  historyEvents,
  projectSettings,
  type DatabaseHandle,
} from "@eml/database";
import {
  calculateCropRectangles,
  cropPng,
  ImageInspectionError,
  inspectPng,
  normalizeOriginalFilename,
  type ImageLimits,
} from "@eml/image-processing";
import {
  buildConceptPrompt,
  buildRefinementPrompt,
  type RefinementFeedback,
} from "@eml/prompt-builder";
import {
  candidateFeedbackInputSchema,
  type AnimationSettingsInput,
  type ApproveAnimationInput,
  type ApproveReferenceInput,
  type CandidateFeedbackInput,
  type CreateDescendantInput,
  type CreateReferenceInput,
  type CreateAnimationInput,
  createCreatureInputSchema,
  type ContactSheetLayoutInput,
  type CandidateSource,
  type CreateCreatureInput,
  type DesignManifestInput,
  type ProjectReferenceSettingsInput,
  type RepairPromptInput,
  type ReorderAnimationFramesInput,
  type UpdateAnimationFrameInput,
  type FrameRole,
} from "@eml/shared";
import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";

import { AppError } from "./errors.js";
import {
  AnimationWorkflow,
  type AnimationFileInput,
  type AnimationView,
} from "./animation.js";
import {
  DesignWorkflow,
  type CreatureDesignOverview,
  type DesignHistoryView,
  type DesignLockView,
  type DesignManifestView,
} from "./design.js";
import {
  EvolutionWorkflow,
  type EvolutionContextView,
  type EvolutionTreeView,
} from "./evolution.js";
import {
  assertPathWithin,
  fromRepositoryRelative,
  resolveWithin,
  toRepositoryRelative,
} from "./paths.js";
import {
  ReferenceWorkflow,
  type ProjectReferenceSettingsView,
  type ReferenceContextView,
  type ReferenceFileInput,
  type ReferenceImageView,
} from "./references.js";

export interface ServiceOptions {
  repositoryRoot: string;
  databasePath?: string;
  workspacePath?: string;
  exportsPath?: string;
  migrationsPath?: string;
  maximumUploadBytes?: number;
  maximumImageWidth?: number;
  maximumImageHeight?: number;
  maximumFilesPerImport?: number;
}

export interface CandidateFileInput {
  buffer: Buffer;
  originalFilename: string;
  crop?: {
    contactSheetImportId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ImportCandidatesInput {
  creatureId: string;
  roundId: string;
  source: CandidateSource;
  files: CandidateFileInput[];
}

export interface CandidateView {
  id: string;
  generationRoundId: string;
  candidateNumber: number;
  originalFilename: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  fileHash: string;
  mimeType: string;
  source: string;
  rejected: boolean;
  selected: boolean;
  locked: boolean;
  thumbnailUrl: string;
  imageUrl: string;
  createdAt: string;
  crop: {
    contactSheetImportId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  feedback: CandidateFeedbackView | null;
}

export interface CandidateFeedbackView extends RefinementFeedback {
  candidateId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatureSummary {
  id: string;
  slug: string;
  displayName: string;
  scientificName: string | null;
  description: string;
  generationBrief: string;
  status: string;
  parentCreatureId: string | null;
  evolutionaryGeneration: number;
  currentRoundId: string | null;
  lockedCandidateId: string | null;
  createdAt: string;
  updatedAt: string;
  selectedCandidate: CandidateView | null;
  lockedCandidate: CandidateView | null;
  roundCount: number;
}

export interface RoundView {
  id: string;
  creatureProjectId: string;
  roundNumber: number;
  roundType: string;
  generatedPrompt: string;
  createdAt: string;
  parentCandidate: CandidateView | null;
  feedbackSnapshot: RefinementFeedback | null;
  candidates: CandidateView[];
}

export interface PromptHistoryEntry {
  roundId: string;
  roundNumber: number;
  roundType: string;
  createdAt: string;
  parentCandidate: CandidateView | null;
  generatedPrompt: string;
  feedbackSnapshot: RefinementFeedback | null;
}

export interface ContactSheetPreview {
  id: string;
  generationRoundId: string;
  originalFilename: string;
  width: number;
  height: number;
  imageUrl: string;
  layout: ContactSheetLayoutInput;
  rectangles: ReturnType<typeof calculateCropRectangles>;
  status: string;
  createdAt: string;
}

export interface CreatureDetail extends CreatureSummary {
  manifest: DesignManifestView | null;
  activeLock: DesignLockView | null;
  lockHistory: DesignLockView[];
  rounds: Array<{
    id: string;
    roundNumber: number;
    roundType: string;
    createdAt: string;
    candidateCount: number;
  }>;
  currentRound: RoundView | null;
}

const defaultImageLimits: ImageLimits = {
  maximumUploadBytes: 10_485_760,
  maximumImageWidth: 4096,
  maximumImageHeight: 4096,
};

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

function now(): string {
  return new Date().toISOString();
}

type CandidateViewSource = Pick<
  typeof candidates.$inferSelect,
  | "id"
  | "generationRoundId"
  | "candidateNumber"
  | "originalFilename"
  | "width"
  | "height"
  | "hasAlpha"
  | "fileHash"
  | "mimeType"
  | "source"
  | "rejected"
  | "selected"
  | "createdAt"
  | "contactSheetImportId"
  | "cropX"
  | "cropY"
  | "cropWidth"
  | "cropHeight"
>;

function candidateToView(
  candidate: CandidateViewSource,
  feedback: CandidateFeedbackView | null = null,
  locked = false,
): CandidateView {
  return {
    id: candidate.id,
    generationRoundId: candidate.generationRoundId,
    candidateNumber: candidate.candidateNumber,
    originalFilename: candidate.originalFilename,
    width: candidate.width,
    height: candidate.height,
    hasAlpha: candidate.hasAlpha,
    fileHash: candidate.fileHash,
    mimeType: candidate.mimeType,
    source: candidate.source,
    rejected: candidate.rejected,
    selected: candidate.selected,
    locked,
    thumbnailUrl: `/api/candidates/${candidate.id}/thumbnail`,
    imageUrl: `/api/candidates/${candidate.id}/image`,
    createdAt: candidate.createdAt,
    crop:
      candidate.contactSheetImportId !== null &&
      candidate.cropX !== null &&
      candidate.cropY !== null &&
      candidate.cropWidth !== null &&
      candidate.cropHeight !== null
        ? {
            contactSheetImportId: candidate.contactSheetImportId,
            x: candidate.cropX,
            y: candidate.cropY,
            width: candidate.cropWidth,
            height: candidate.cropHeight,
          }
        : null,
    feedback,
  };
}

const emptyFeedback: RefinementFeedback = {
  preserveTraits: [],
  anatomyToPreserve: [],
  paletteToPreserve: [],
  silhouetteToPreserve: [],
  defects: [],
  requestedChanges: [],
  forbiddenChanges: [],
  generalNotes: "",
};

function parseStringList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseFeedbackSnapshot(
  value: string | null,
): RefinementFeedback | null {
  if (!value) return null;
  try {
    return candidateFeedbackInputSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

export class EvolutionModelLabService {
  public readonly repositoryRoot: string;
  public readonly workspaceRoot: string;
  public readonly exportsRoot: string;
  private readonly database: DatabaseHandle;
  private readonly design: DesignWorkflow;
  private readonly evolution: EvolutionWorkflow;
  private readonly references: ReferenceWorkflow;
  private readonly animation: AnimationWorkflow;
  private readonly limits: ImageLimits;
  private readonly maximumFilesPerImport: number;

  constructor(options: ServiceOptions) {
    this.repositoryRoot = resolve(options.repositoryRoot);
    this.workspaceRoot = resolveWithin(
      this.repositoryRoot,
      options.workspacePath ?? "workspace",
    );
    this.exportsRoot = resolveWithin(
      this.repositoryRoot,
      options.exportsPath ?? "exports",
    );
    const databasePath = resolveWithin(
      this.repositoryRoot,
      options.databasePath ?? "data/evolution-model-lab.db",
    );
    const migrationsFolder = resolveWithin(
      this.repositoryRoot,
      options.migrationsPath ?? "packages/database/drizzle",
    );
    this.database = createDatabase(databasePath, migrationsFolder);
    this.limits = {
      maximumUploadBytes:
        options.maximumUploadBytes ?? defaultImageLimits.maximumUploadBytes,
      maximumImageWidth:
        options.maximumImageWidth ?? defaultImageLimits.maximumImageWidth,
      maximumImageHeight:
        options.maximumImageHeight ?? defaultImageLimits.maximumImageHeight,
    };
    this.maximumFilesPerImport = options.maximumFilesPerImport ?? 10;
    this.ensureDefaultSettings();
    this.design = new DesignWorkflow(
      this.database.db,
      this.repositoryRoot,
      this.workspaceRoot,
      this.limits,
    );
    this.evolution = new EvolutionWorkflow(
      this.database.db,
      this.repositoryRoot,
      this.workspaceRoot,
      this.limits,
      this.design,
    );
    this.references = new ReferenceWorkflow(
      this.database.db,
      this.repositoryRoot,
      this.workspaceRoot,
      this.limits,
    );
    this.animation = new AnimationWorkflow(
      this.database.db,
      this.repositoryRoot,
      this.workspaceRoot,
      this.limits,
      this.references,
    );
  }

  close(): void {
    this.database.close();
  }

  private ensureDefaultSettings(): void {
    const timestamp = now();
    this.database.db
      .insert(projectSettings)
      .values({
        id: "default",
        workspaceRoot: "workspace",
        exportsRoot: "exports",
        maximumUploadBytes: this.limits.maximumUploadBytes,
        maximumImageWidth: this.limits.maximumImageWidth,
        maximumImageHeight: this.limits.maximumImageHeight,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing()
      .run();
  }

  private feedbackForCandidate(
    candidateId: string,
  ): CandidateFeedbackView | null {
    const row = this.database.db
      .select()
      .from(candidateFeedback)
      .where(eq(candidateFeedback.candidateId, candidateId))
      .get();
    return row
      ? {
          candidateId: row.candidateId,
          preserveTraits: parseStringList(row.preserveTraits),
          anatomyToPreserve: parseStringList(row.anatomyToPreserve),
          paletteToPreserve: parseStringList(row.paletteToPreserve),
          silhouetteToPreserve: parseStringList(row.silhouetteToPreserve),
          defects: parseStringList(row.defects),
          requestedChanges: parseStringList(row.requestedChanges),
          forbiddenChanges: parseStringList(row.forbiddenChanges),
          generalNotes: row.generalNotes ?? "",
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }
      : null;
  }

  private candidateView(candidate: CandidateViewSource): CandidateView {
    return candidateToView(
      candidate,
      this.feedbackForCandidate(candidate.id),
      this.design.isCandidateLocked(candidate.id),
    );
  }

  async createCreature(input: CreateCreatureInput): Promise<CreatureDetail> {
    const parsed = createCreatureInputSchema.parse(input);
    const baseSlug = slugify(parsed.displayName);
    let slug = baseSlug;
    let suffix = 2;
    while (
      this.database.db
        .select({ id: creatureProjects.id })
        .from(creatureProjects)
        .where(eq(creatureProjects.slug, slug))
        .get()
    ) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const id = randomUUID();
    const timestamp = now();
    const initialManifest = this.design.buildInitialManifest(id, timestamp);
    const creatureRoot = resolveWithin(this.workspaceRoot, "creatures", slug);
    const manifestPath = resolveWithin(creatureRoot, "manifest.json");

    await mkdir(resolveWithin(creatureRoot, "history"), { recursive: true });
    await mkdir(resolveWithin(creatureRoot, "references"), { recursive: true });
    await mkdir(resolveWithin(creatureRoot, "rounds"), { recursive: true });
    await mkdir(resolveWithin(creatureRoot, "animations"), { recursive: true });
    await mkdir(resolveWithin(creatureRoot, "exports"), { recursive: true });

    try {
      await writeFile(manifestPath, initialManifest.serialized, {
        encoding: "utf8",
        flag: "wx",
      });

      this.database.db.transaction((tx) => {
        tx.insert(creatureProjects)
          .values({
            id,
            slug,
            displayName: parsed.displayName,
            scientificName: parsed.scientificName ?? null,
            description: parsed.description,
            generationBrief: parsed.generationBrief,
            status: "DRAFT",
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .run();
        tx.insert(designManifests).values(initialManifest.row).run();
        tx.insert(historyEvents)
          .values({
            id: randomUUID(),
            creatureProjectId: id,
            entityType: "CreatureProject",
            entityId: id,
            action: "PROJECT_CREATED",
            payload: JSON.stringify({ displayName: parsed.displayName, slug }),
            createdAt: timestamp,
          })
          .run();
        tx.insert(historyEvents)
          .values({
            id: randomUUID(),
            creatureProjectId: id,
            entityType: "DesignManifest",
            entityId: initialManifest.row.id,
            action: "MANIFEST_CREATED",
            payload: JSON.stringify({ source: "PROJECT_DEFAULTS" }),
            manifestVersion: 0,
            actor: "SYSTEM",
            createdAt: timestamp,
          })
          .run();
      });
    } catch (error) {
      await rm(creatureRoot, { recursive: true, force: true });
      throw error;
    }

    return this.getCreature(id);
  }

  listCreatures(): CreatureSummary[] {
    const rows = this.database.db
      .select()
      .from(creatureProjects)
      .where(isNull(creatureProjects.deletedAt))
      .orderBy(desc(creatureProjects.updatedAt))
      .all();

    return rows.map((creature) => {
      const roundRows = this.database.db
        .select({ id: generationRounds.id })
        .from(generationRounds)
        .where(
          and(
            eq(generationRounds.creatureProjectId, creature.id),
            isNull(generationRounds.deletedAt),
          ),
        )
        .all();
      let selected = creature.currentRoundId
        ? this.database.db
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
      if (!selected && creature.currentRoundId) {
        const currentRound = this.database.db
          .select({ parentCandidateId: generationRounds.parentCandidateId })
          .from(generationRounds)
          .where(eq(generationRounds.id, creature.currentRoundId))
          .get();
        selected = currentRound?.parentCandidateId
          ? this.database.db
              .select()
              .from(candidates)
              .where(eq(candidates.id, currentRound.parentCandidateId))
              .get()
          : undefined;
      }
      const locked = creature.lockedCandidateId
        ? this.database.db
            .select()
            .from(candidates)
            .where(eq(candidates.id, creature.lockedCandidateId))
            .get()
        : undefined;
      return {
        id: creature.id,
        slug: creature.slug,
        displayName: creature.displayName,
        scientificName: creature.scientificName,
        description: creature.description,
        generationBrief: creature.generationBrief,
        status: creature.status,
        parentCreatureId: creature.parentCreatureId,
        evolutionaryGeneration: creature.evolutionaryGeneration ?? 0,
        currentRoundId: creature.currentRoundId,
        lockedCandidateId: creature.lockedCandidateId,
        createdAt: creature.createdAt,
        updatedAt: creature.updatedAt,
        selectedCandidate: selected ? this.candidateView(selected) : null,
        lockedCandidate: locked ? this.candidateView(locked) : null,
        roundCount: roundRows.length,
      };
    });
  }

  getDashboard(): {
    totals: { creatures: number; inConcept: number; selected: number };
    recentCreatures: CreatureSummary[];
    recentActivity: Array<{
      id: string;
      action: string;
      createdAt: string;
      entityId: string;
    }>;
  } {
    const creatures = this.listCreatures();
    const activity = this.database.db
      .select()
      .from(historyEvents)
      .orderBy(desc(historyEvents.createdAt))
      .limit(8)
      .all();
    return {
      totals: {
        creatures: creatures.length,
        inConcept: creatures.filter((item) => item.status === "CONCEPT").length,
        selected: creatures.filter(
          (item) => item.status === "CANDIDATE_SELECTED",
        ).length,
      },
      recentCreatures: creatures.slice(0, 5),
      recentActivity: activity.map((event) => ({
        id: event.id,
        action: event.action,
        createdAt: event.createdAt,
        entityId: event.entityId,
      })),
    };
  }

  getCreature(creatureId: string): CreatureDetail {
    const creature = this.database.db
      .select()
      .from(creatureProjects)
      .where(
        and(
          eq(creatureProjects.id, creatureId),
          isNull(creatureProjects.deletedAt),
        ),
      )
      .get();
    if (!creature) {
      throw new AppError(
        "CREATURE_NOT_FOUND",
        "Creature project not found.",
        404,
      );
    }
    const roundRows = this.database.db
      .select()
      .from(generationRounds)
      .where(
        and(
          eq(generationRounds.creatureProjectId, creature.id),
          isNull(generationRounds.deletedAt),
        ),
      )
      .orderBy(asc(generationRounds.roundNumber))
      .all();

    const rounds = roundRows.map((round) => {
      const candidateRows = this.database.db
        .select({ id: candidates.id })
        .from(candidates)
        .where(
          and(
            eq(candidates.generationRoundId, round.id),
            isNull(candidates.deletedAt),
          ),
        )
        .all();
      return {
        id: round.id,
        roundNumber: round.roundNumber,
        roundType: round.roundType,
        createdAt: round.createdAt,
        candidateCount: candidateRows.length,
      };
    });

    const currentRoundRow = creature.currentRoundId
      ? roundRows.find((round) => round.id === creature.currentRoundId)
      : undefined;
    const currentCandidates = currentRoundRow
      ? this.database.db
          .select()
          .from(candidates)
          .where(
            and(
              eq(candidates.generationRoundId, currentRoundRow.id),
              isNull(candidates.deletedAt),
            ),
          )
          .orderBy(asc(candidates.candidateNumber))
          .all()
      : [];
    let selected = currentCandidates.find((candidate) => candidate.selected);
    if (!selected && currentRoundRow?.parentCandidateId) {
      selected = this.database.db
        .select()
        .from(candidates)
        .where(eq(candidates.id, currentRoundRow.parentCandidateId))
        .get();
    }
    const locked = creature.lockedCandidateId
      ? this.database.db
          .select()
          .from(candidates)
          .where(eq(candidates.id, creature.lockedCandidateId))
          .get()
      : undefined;
    const design = this.design.getOverview(creature.id);

    return {
      id: creature.id,
      slug: creature.slug,
      displayName: creature.displayName,
      scientificName: creature.scientificName,
      description: creature.description,
      generationBrief: creature.generationBrief,
      status: creature.status,
      parentCreatureId: creature.parentCreatureId,
      evolutionaryGeneration: creature.evolutionaryGeneration ?? 0,
      currentRoundId: creature.currentRoundId,
      lockedCandidateId: creature.lockedCandidateId,
      createdAt: creature.createdAt,
      updatedAt: creature.updatedAt,
      selectedCandidate: selected ? this.candidateView(selected) : null,
      lockedCandidate: locked ? this.candidateView(locked) : null,
      roundCount: rounds.length,
      manifest: design.manifest,
      activeLock: design.activeLock,
      lockHistory: design.lockHistory,
      rounds,
      currentRound: currentRoundRow
        ? {
            id: currentRoundRow.id,
            creatureProjectId: currentRoundRow.creatureProjectId,
            roundNumber: currentRoundRow.roundNumber,
            roundType: currentRoundRow.roundType,
            generatedPrompt: currentRoundRow.generatedPrompt,
            createdAt: currentRoundRow.createdAt,
            parentCandidate: currentRoundRow.parentCandidateId
              ? (() => {
                  const parent = this.database.db
                    .select()
                    .from(candidates)
                    .where(
                      eq(candidates.id, currentRoundRow.parentCandidateId!),
                    )
                    .get();
                  return parent ? this.candidateView(parent) : null;
                })()
              : null,
            feedbackSnapshot: parseFeedbackSnapshot(
              currentRoundRow.feedbackSnapshot,
            ),
            candidates: currentCandidates.map((candidate) =>
              this.candidateView(candidate),
            ),
          }
        : null,
    };
  }

  async createConceptRound(creatureId: string): Promise<RoundView> {
    const creature = this.database.db
      .select()
      .from(creatureProjects)
      .where(
        and(
          eq(creatureProjects.id, creatureId),
          isNull(creatureProjects.deletedAt),
        ),
      )
      .get();
    if (!creature) {
      throw new AppError(
        "CREATURE_NOT_FOUND",
        "Creature project not found.",
        404,
      );
    }
    if (creature.status !== "DRAFT") {
      throw new AppError(
        "INVALID_WORKFLOW_STATE",
        "A concept round can only be created for a draft creature.",
        409,
        { currentStatus: creature.status, requiredStatus: "DRAFT" },
      );
    }

    const previous = this.database.db
      .select({ roundNumber: generationRounds.roundNumber })
      .from(generationRounds)
      .where(
        and(
          eq(generationRounds.creatureProjectId, creature.id),
          isNull(generationRounds.deletedAt),
        ),
      )
      .orderBy(desc(generationRounds.roundNumber))
      .get();
    const roundNumber = (previous?.roundNumber ?? 0) + 1;
    const id = randomUUID();
    const timestamp = now();
    const prompt = buildConceptPrompt({
      displayName: creature.displayName,
      scientificName: creature.scientificName,
      generationBrief: creature.generationBrief,
      roundNumber,
      candidateCount: 10,
    });
    const creatureRoot = resolveWithin(
      this.workspaceRoot,
      "creatures",
      creature.slug,
    );
    const roundFolderName = `round-${String(roundNumber).padStart(3, "0")}-concept`;
    const roundRoot = resolveWithin(creatureRoot, "rounds", roundFolderName);
    await mkdir(resolveWithin(roundRoot, "candidates"), { recursive: true });
    await mkdir(resolveWithin(roundRoot, "source-contact-sheets"), {
      recursive: true,
    });
    await mkdir(resolveWithin(roundRoot, "thumbnails"), { recursive: true });

    try {
      await writeFile(resolveWithin(roundRoot, "prompt.txt"), `${prompt}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      await writeFile(
        resolveWithin(roundRoot, "generation-context.json"),
        `${JSON.stringify(
          {
            schemaVersion: 1,
            creatureId: creature.id,
            roundId: id,
            roundNumber,
            roundType: "CONCEPT",
            expectedCandidateCount: 10,
            workflowState: "CONCEPT",
            createdAt: timestamp,
          },
          null,
          2,
        )}\n`,
        { encoding: "utf8", flag: "wx" },
      );

      this.database.db.transaction((tx) => {
        tx.insert(generationRounds)
          .values({
            id,
            creatureProjectId: creature.id,
            roundNumber,
            roundType: "CONCEPT",
            generatedPrompt: prompt,
            createdAt: timestamp,
          })
          .run();
        tx.update(creatureProjects)
          .set({ status: "CONCEPT", currentRoundId: id, updatedAt: timestamp })
          .where(eq(creatureProjects.id, creature.id))
          .run();
        tx.insert(historyEvents)
          .values({
            id: randomUUID(),
            creatureProjectId: creature.id,
            entityType: "GenerationRound",
            entityId: id,
            action: "GENERATION_ROUND_CREATED",
            payload: JSON.stringify({ roundNumber, roundType: "CONCEPT" }),
            createdAt: timestamp,
          })
          .run();
      });
    } catch (error) {
      await rm(roundRoot, { recursive: true, force: true });
      throw error;
    }

    return this.getRound(id);
  }

  getRound(roundId: string): RoundView {
    const round = this.database.db
      .select()
      .from(generationRounds)
      .where(
        and(
          eq(generationRounds.id, roundId),
          isNull(generationRounds.deletedAt),
        ),
      )
      .get();
    if (!round) {
      throw new AppError("ROUND_NOT_FOUND", "Generation round not found.", 404);
    }
    const candidateRows = this.database.db
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.generationRoundId, round.id),
          isNull(candidates.deletedAt),
        ),
      )
      .orderBy(asc(candidates.candidateNumber))
      .all();
    return {
      id: round.id,
      creatureProjectId: round.creatureProjectId,
      roundNumber: round.roundNumber,
      roundType: round.roundType,
      generatedPrompt: round.generatedPrompt,
      createdAt: round.createdAt,
      parentCandidate: round.parentCandidateId
        ? (() => {
            const parent = this.database.db
              .select()
              .from(candidates)
              .where(eq(candidates.id, round.parentCandidateId!))
              .get();
            return parent ? this.candidateView(parent) : null;
          })()
        : null,
      feedbackSnapshot: parseFeedbackSnapshot(round.feedbackSnapshot),
      candidates: candidateRows.map((candidate) =>
        this.candidateView(candidate),
      ),
    };
  }

  async importCandidates(
    input: ImportCandidatesInput,
  ): Promise<CandidateView[]> {
    if (
      input.files.length < 1 ||
      input.files.length > this.maximumFilesPerImport
    ) {
      throw new AppError(
        "INVALID_FILE_COUNT",
        `Import between 1 and ${this.maximumFilesPerImport} PNG images at a time.`,
        400,
      );
    }
    const round = this.database.db
      .select()
      .from(generationRounds)
      .where(
        and(
          eq(generationRounds.id, input.roundId),
          isNull(generationRounds.deletedAt),
        ),
      )
      .get();
    if (!round || round.creatureProjectId !== input.creatureId) {
      throw new AppError(
        "ROUND_NOT_FOUND",
        "The generation round does not belong to this creature.",
        404,
      );
    }
    const creature = this.database.db
      .select()
      .from(creatureProjects)
      .where(
        and(
          eq(creatureProjects.id, input.creatureId),
          isNull(creatureProjects.deletedAt),
        ),
      )
      .get();
    if (!creature) {
      throw new AppError(
        "CREATURE_NOT_FOUND",
        "Creature project not found.",
        404,
      );
    }
    if (creature.currentRoundId !== round.id) {
      throw new AppError(
        "HISTORICAL_ROUND_IMMUTABLE",
        "Candidates can only be imported into the creature's current round.",
        409,
      );
    }
    if (
      round.roundType !== "CONCEPT" &&
      round.roundType !== "REFINEMENT" &&
      round.roundType !== "EVOLUTION"
    ) {
      throw new AppError(
        "INVALID_ROUND_TYPE",
        "Candidates can only be imported into concept, refinement, or evolution rounds.",
        409,
      );
    }

    const existing = this.database.db
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.generationRoundId, round.id),
          isNull(candidates.deletedAt),
        ),
      )
      .orderBy(asc(candidates.candidateNumber))
      .all();
    if (existing.length + input.files.length > 10) {
      throw new AppError(
        "CANDIDATE_LIMIT_EXCEEDED",
        "A generation round can contain at most 10 candidates.",
        409,
      );
    }

    let inspected: Awaited<ReturnType<typeof inspectPng>>[];
    try {
      inspected = await Promise.all(
        input.files.map((file) => inspectPng(file.buffer, this.limits)),
      );
    } catch (error) {
      if (error instanceof ImageInspectionError) {
        throw new AppError(error.code, error.message, 400);
      }
      throw error;
    }

    const existingHashes = new Set(
      existing.map((candidate) => candidate.fileHash),
    );
    const batchHashes = new Set<string>();
    for (const image of inspected) {
      if (
        existingHashes.has(image.fileHash) ||
        batchHashes.has(image.fileHash)
      ) {
        throw new AppError(
          "DUPLICATE_IMAGE",
          "This exact PNG has already been imported into the round.",
          409,
          { fileHash: image.fileHash },
        );
      }
      batchHashes.add(image.fileHash);
    }

    const creatureRoot = resolveWithin(
      this.workspaceRoot,
      "creatures",
      creature.slug,
    );
    const roundFolderName = `round-${String(round.roundNumber).padStart(3, "0")}-${round.roundType.toLowerCase()}`;
    const roundRoot = resolveWithin(creatureRoot, "rounds", roundFolderName);
    const candidateRoot = resolveWithin(roundRoot, "candidates");
    const thumbnailRoot = resolveWithin(roundRoot, "thumbnails");
    await mkdir(candidateRoot, { recursive: true });
    await mkdir(thumbnailRoot, { recursive: true });

    const timestamp = now();
    const nextNumber = (existing.at(-1)?.candidateNumber ?? 0) + 1;
    const rows = input.files.map((file, index) => {
      const image = inspected[index];
      if (!image) {
        throw new AppError(
          "IMPORT_FAILED",
          "Image inspection results were incomplete.",
          500,
        );
      }
      const id = randomUUID();
      const imagePath = resolveWithin(candidateRoot, `${id}.png`);
      const thumbnailPath = resolveWithin(thumbnailRoot, `${id}.png`);
      return {
        id,
        generationRoundId: round.id,
        candidateNumber: nextNumber + index,
        imagePath: toRepositoryRelative(this.repositoryRoot, imagePath),
        thumbnailPath: toRepositoryRelative(this.repositoryRoot, thumbnailPath),
        source: input.source,
        originalFilename: normalizeOriginalFilename(file.originalFilename),
        width: image.width,
        height: image.height,
        hasAlpha: image.hasAlpha,
        fileHash: image.fileHash,
        mimeType: image.mimeType,
        rejected: false,
        selected: false,
        createdAt: timestamp,
        contactSheetImportId: file.crop?.contactSheetImportId ?? null,
        cropX: file.crop?.x ?? null,
        cropY: file.crop?.y ?? null,
        cropWidth: file.crop?.width ?? null,
        cropHeight: file.crop?.height ?? null,
        originalBytes: file.buffer,
        thumbnailBytes: image.thumbnail,
      };
    });

    const writtenPaths: string[] = [];
    try {
      for (const row of rows) {
        const imagePath = fromRepositoryRelative(
          this.repositoryRoot,
          row.imagePath,
        );
        const thumbnailPath = fromRepositoryRelative(
          this.repositoryRoot,
          row.thumbnailPath,
        );
        await writeFile(imagePath, row.originalBytes, { flag: "wx" });
        writtenPaths.push(imagePath);
        await writeFile(thumbnailPath, row.thumbnailBytes, { flag: "wx" });
        writtenPaths.push(thumbnailPath);
      }

      this.database.db.transaction((tx) => {
        tx.insert(candidates)
          .values(
            rows.map((row) => ({
              id: row.id,
              generationRoundId: row.generationRoundId,
              candidateNumber: row.candidateNumber,
              imagePath: row.imagePath,
              thumbnailPath: row.thumbnailPath,
              source: row.source,
              originalFilename: row.originalFilename,
              width: row.width,
              height: row.height,
              hasAlpha: row.hasAlpha,
              fileHash: row.fileHash,
              mimeType: row.mimeType,
              rejected: row.rejected,
              selected: row.selected,
              createdAt: row.createdAt,
              contactSheetImportId: row.contactSheetImportId,
              cropX: row.cropX,
              cropY: row.cropY,
              cropWidth: row.cropWidth,
              cropHeight: row.cropHeight,
            })),
          )
          .run();
        tx.insert(historyEvents)
          .values({
            id: randomUUID(),
            creatureProjectId: creature.id,
            entityType: "GenerationRound",
            entityId: round.id,
            action:
              input.source === "CONTACT_SHEET"
                ? "CONTACT_SHEET_SPLIT"
                : input.source === "CLIPBOARD"
                  ? "CLIPBOARD_IMAGE_IMPORTED"
                  : "FILES_IMPORTED",
            payload: JSON.stringify({
              candidateIds: rows.map((row) => row.id),
              source: input.source,
              count: rows.length,
            }),
            createdAt: timestamp,
          })
          .run();
        tx.update(creatureProjects)
          .set({ updatedAt: timestamp })
          .where(eq(creatureProjects.id, creature.id))
          .run();
      });
    } catch (error) {
      await Promise.all(
        writtenPaths.map((writtenPath) => rm(writtenPath, { force: true })),
      );
      throw error;
    }

    return rows.map((row) => this.candidateView(row));
  }

  selectCandidate(roundId: string, candidateId: string): CandidateView {
    const round = this.database.db
      .select()
      .from(generationRounds)
      .where(
        and(
          eq(generationRounds.id, roundId),
          isNull(generationRounds.deletedAt),
        ),
      )
      .get();
    if (!round) {
      throw new AppError("ROUND_NOT_FOUND", "Generation round not found.", 404);
    }
    const candidate = this.database.db
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.id, candidateId),
          eq(candidates.generationRoundId, round.id),
          isNull(candidates.deletedAt),
        ),
      )
      .get();
    if (!candidate) {
      throw new AppError(
        "CANDIDATE_NOT_FOUND",
        "The candidate does not belong to this round.",
        404,
      );
    }
    if (candidate.rejected) {
      throw new AppError(
        "CANDIDATE_REJECTED",
        "Restore the candidate before selecting it.",
        409,
      );
    }
    const creature = this.database.db
      .select()
      .from(creatureProjects)
      .where(eq(creatureProjects.id, round.creatureProjectId))
      .get();
    if (!creature || creature.currentRoundId !== round.id) {
      throw new AppError(
        "HISTORICAL_ROUND_IMMUTABLE",
        "The selected parent of a historical round cannot be changed.",
        409,
      );
    }

    const timestamp = now();
    this.database.db.transaction((tx) => {
      tx.update(candidates)
        .set({ selected: false })
        .where(
          and(
            eq(candidates.generationRoundId, round.id),
            ne(candidates.id, candidate.id),
            isNull(candidates.deletedAt),
          ),
        )
        .run();
      tx.update(candidates)
        .set({ selected: true })
        .where(eq(candidates.id, candidate.id))
        .run();
      tx.update(creatureProjects)
        .set({
          status: this.design.hasActiveLock(round.creatureProjectId)
            ? "DESIGN_LOCKED"
            : "CANDIDATE_SELECTED",
          updatedAt: timestamp,
        })
        .where(eq(creatureProjects.id, round.creatureProjectId))
        .run();
      tx.insert(historyEvents)
        .values({
          id: randomUUID(),
          creatureProjectId: round.creatureProjectId,
          entityType: "Candidate",
          entityId: candidate.id,
          action: "CANDIDATE_SELECTED",
          payload: JSON.stringify({
            roundId: round.id,
            candidateNumber: candidate.candidateNumber,
          }),
          createdAt: timestamp,
        })
        .run();
    });

    return this.candidateView({ ...candidate, selected: true });
  }

  saveCandidateFeedback(
    candidateId: string,
    input: CandidateFeedbackInput,
  ): CandidateFeedbackView {
    const parsed = candidateFeedbackInputSchema.parse(input);
    const candidate = this.database.db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), isNull(candidates.deletedAt)))
      .get();
    if (!candidate) {
      throw new AppError("CANDIDATE_NOT_FOUND", "Candidate not found.", 404);
    }
    if (!candidate.selected) {
      throw new AppError(
        "CANDIDATE_NOT_SELECTED",
        "Feedback can only be recorded for the selected parent candidate.",
        409,
      );
    }
    const round = this.database.db
      .select()
      .from(generationRounds)
      .where(eq(generationRounds.id, candidate.generationRoundId))
      .get();
    if (!round) {
      throw new AppError("ROUND_NOT_FOUND", "Generation round not found.", 404);
    }
    const timestamp = now();
    const existing = this.database.db
      .select()
      .from(candidateFeedback)
      .where(eq(candidateFeedback.candidateId, candidate.id))
      .get();
    const values = {
      preserveTraits: JSON.stringify(parsed.preserveTraits),
      anatomyToPreserve: JSON.stringify(parsed.anatomyToPreserve),
      paletteToPreserve: JSON.stringify(parsed.paletteToPreserve),
      silhouetteToPreserve: JSON.stringify(parsed.silhouetteToPreserve),
      defects: JSON.stringify(parsed.defects),
      requestedChanges: JSON.stringify(parsed.requestedChanges),
      forbiddenChanges: JSON.stringify(parsed.forbiddenChanges),
      generalNotes: parsed.generalNotes,
      updatedAt: timestamp,
    };
    this.database.db.transaction((tx) => {
      if (existing) {
        tx.update(candidateFeedback)
          .set(values)
          .where(eq(candidateFeedback.candidateId, candidate.id))
          .run();
      } else {
        tx.insert(candidateFeedback)
          .values({
            id: randomUUID(),
            candidateId: candidate.id,
            ...values,
            createdAt: timestamp,
          })
          .run();
      }
      tx.insert(historyEvents)
        .values({
          id: randomUUID(),
          creatureProjectId: round.creatureProjectId,
          entityType: "CandidateFeedback",
          entityId: candidate.id,
          action: existing ? "FEEDBACK_UPDATED" : "FEEDBACK_RECORDED",
          payload: JSON.stringify(parsed),
          createdAt: timestamp,
        })
        .run();
      tx.update(creatureProjects)
        .set({ updatedAt: timestamp })
        .where(eq(creatureProjects.id, round.creatureProjectId))
        .run();
    });
    return this.feedbackForCandidate(candidate.id)!;
  }

  async createRefinementRound(creatureId: string): Promise<RoundView> {
    const creature = this.database.db
      .select()
      .from(creatureProjects)
      .where(
        and(
          eq(creatureProjects.id, creatureId),
          isNull(creatureProjects.deletedAt),
        ),
      )
      .get();
    if (!creature) {
      throw new AppError(
        "CREATURE_NOT_FOUND",
        "Creature project not found.",
        404,
      );
    }
    if (creature.status !== "CANDIDATE_SELECTED" || !creature.currentRoundId) {
      throw new AppError(
        "REFINEMENT_PARENT_REQUIRED",
        "Select exactly one parent candidate in the current round before refining.",
        409,
      );
    }
    const currentRound = this.database.db
      .select()
      .from(generationRounds)
      .where(
        and(
          eq(generationRounds.id, creature.currentRoundId),
          eq(generationRounds.creatureProjectId, creature.id),
          isNull(generationRounds.deletedAt),
        ),
      )
      .get();
    if (!currentRound) {
      throw new AppError("ROUND_NOT_FOUND", "Current round not found.", 404);
    }
    const selected = this.database.db
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.generationRoundId, currentRound.id),
          eq(candidates.selected, true),
          isNull(candidates.deletedAt),
        ),
      )
      .all();
    if (selected.length !== 1 || !selected[0]) {
      throw new AppError(
        "REFINEMENT_PARENT_REQUIRED",
        "Select exactly one parent candidate in the current round before refining.",
        409,
      );
    }
    const parent = selected[0];
    const storedFeedback = this.feedbackForCandidate(parent.id);
    const feedback: RefinementFeedback = storedFeedback
      ? {
          preserveTraits: storedFeedback.preserveTraits,
          anatomyToPreserve: storedFeedback.anatomyToPreserve,
          paletteToPreserve: storedFeedback.paletteToPreserve,
          silhouetteToPreserve: storedFeedback.silhouetteToPreserve,
          defects: storedFeedback.defects,
          requestedChanges: storedFeedback.requestedChanges,
          forbiddenChanges: storedFeedback.forbiddenChanges,
          generalNotes: storedFeedback.generalNotes,
        }
      : { ...emptyFeedback };
    const settings = this.database.db
      .select()
      .from(projectSettings)
      .where(eq(projectSettings.id, "default"))
      .get();
    if (!settings) {
      throw new AppError(
        "SETTINGS_NOT_FOUND",
        "Project settings not found.",
        500,
      );
    }
    const latest = this.database.db
      .select({ roundNumber: generationRounds.roundNumber })
      .from(generationRounds)
      .where(
        and(
          eq(generationRounds.creatureProjectId, creature.id),
          isNull(generationRounds.deletedAt),
        ),
      )
      .orderBy(desc(generationRounds.roundNumber))
      .get();
    const roundNumber = (latest?.roundNumber ?? 0) + 1;
    const constraints = {
      camera: "consistent orthographic side-view game camera",
      facing: settings.defaultFacing,
      canvasWidth: settings.defaultCanvasWidth,
      canvasHeight: settings.defaultCanvasHeight,
      transparency: settings.requireTransparency,
      lighting: "consistent neutral studio lighting",
      style: "match the selected parent and stored generation brief",
    };
    const prompt = buildRefinementPrompt({
      displayName: creature.displayName,
      scientificName: creature.scientificName,
      generationBrief: creature.generationBrief,
      roundNumber,
      parentCandidateId: parent.id,
      parentCandidateNumber: parent.candidateNumber,
      feedback,
      constraints,
    });
    const id = randomUUID();
    const timestamp = now();
    const roundRoot = resolveWithin(
      this.workspaceRoot,
      "creatures",
      creature.slug,
      "rounds",
      `round-${String(roundNumber).padStart(3, "0")}-refinement`,
    );
    await mkdir(resolveWithin(roundRoot, "candidates"), { recursive: true });
    await mkdir(resolveWithin(roundRoot, "source-contact-sheets"), {
      recursive: true,
    });
    await mkdir(resolveWithin(roundRoot, "thumbnails"), { recursive: true });
    try {
      await writeFile(resolveWithin(roundRoot, "prompt.txt"), `${prompt}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      await writeFile(
        resolveWithin(roundRoot, "generation-context.json"),
        `${JSON.stringify(
          {
            schemaVersion: 2,
            creatureId: creature.id,
            roundId: id,
            roundNumber,
            roundType: "REFINEMENT",
            workflowState: "REFINING",
            expectedCandidateCount: 10,
            parentCandidate: {
              id: parent.id,
              candidateNumber: parent.candidateNumber,
              imagePath: parent.imagePath,
            },
            feedback,
            constraints,
            createdAt: timestamp,
          },
          null,
          2,
        )}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      this.database.db.transaction((tx) => {
        tx.insert(generationRounds)
          .values({
            id,
            creatureProjectId: creature.id,
            roundNumber,
            roundType: "REFINEMENT",
            parentCandidateId: parent.id,
            generatedPrompt: prompt,
            positiveFeedback: JSON.stringify(feedback.preserveTraits),
            defectsToCorrect: JSON.stringify(feedback.defects),
            requestedChanges: JSON.stringify(feedback.requestedChanges),
            forbiddenChanges: JSON.stringify(feedback.forbiddenChanges),
            feedbackSnapshot: JSON.stringify(feedback),
            createdAt: timestamp,
          })
          .run();
        tx.update(creatureProjects)
          .set({ status: "REFINING", currentRoundId: id, updatedAt: timestamp })
          .where(eq(creatureProjects.id, creature.id))
          .run();
        tx.insert(historyEvents)
          .values({
            id: randomUUID(),
            creatureProjectId: creature.id,
            entityType: "GenerationRound",
            entityId: id,
            action: "REFINEMENT_ROUND_CREATED",
            payload: JSON.stringify({
              roundNumber,
              parentCandidateId: parent.id,
              feedback,
            }),
            createdAt: timestamp,
          })
          .run();
      });
    } catch (error) {
      await rm(roundRoot, { recursive: true, force: true });
      throw error;
    }
    return this.getRound(id);
  }

  getPromptHistory(creatureId: string): PromptHistoryEntry[] {
    const creature = this.database.db
      .select({ id: creatureProjects.id })
      .from(creatureProjects)
      .where(
        and(
          eq(creatureProjects.id, creatureId),
          isNull(creatureProjects.deletedAt),
        ),
      )
      .get();
    if (!creature) {
      throw new AppError(
        "CREATURE_NOT_FOUND",
        "Creature project not found.",
        404,
      );
    }
    return this.database.db
      .select()
      .from(generationRounds)
      .where(
        and(
          eq(generationRounds.creatureProjectId, creatureId),
          isNull(generationRounds.deletedAt),
        ),
      )
      .orderBy(asc(generationRounds.roundNumber))
      .all()
      .map((round) => {
        const parent = round.parentCandidateId
          ? this.database.db
              .select()
              .from(candidates)
              .where(eq(candidates.id, round.parentCandidateId))
              .get()
          : undefined;
        return {
          roundId: round.id,
          roundNumber: round.roundNumber,
          roundType: round.roundType,
          createdAt: round.createdAt,
          parentCandidate: parent ? this.candidateView(parent) : null,
          generatedPrompt: round.generatedPrompt,
          feedbackSnapshot: parseFeedbackSnapshot(round.feedbackSnapshot),
        };
      });
  }

  async previewContactSheet(input: {
    creatureId: string;
    roundId: string;
    file: CandidateFileInput;
    layout: ContactSheetLayoutInput;
  }): Promise<ContactSheetPreview> {
    const round = this.database.db
      .select()
      .from(generationRounds)
      .where(
        and(
          eq(generationRounds.id, input.roundId),
          isNull(generationRounds.deletedAt),
        ),
      )
      .get();
    if (!round || round.creatureProjectId !== input.creatureId) {
      throw new AppError("ROUND_NOT_FOUND", "Generation round not found.", 404);
    }
    if (
      round.roundType !== "CONCEPT" &&
      round.roundType !== "REFINEMENT" &&
      round.roundType !== "EVOLUTION"
    ) {
      throw new AppError(
        "INVALID_ROUND_TYPE",
        "This round cannot import images.",
        409,
      );
    }
    const creature = this.database.db
      .select()
      .from(creatureProjects)
      .where(eq(creatureProjects.id, input.creatureId))
      .get();
    if (!creature) {
      throw new AppError(
        "CREATURE_NOT_FOUND",
        "Creature project not found.",
        404,
      );
    }
    if (creature.currentRoundId !== round.id) {
      throw new AppError(
        "HISTORICAL_ROUND_IMMUTABLE",
        "Contact sheets can only be imported into the current round.",
        409,
      );
    }
    let inspected: Awaited<ReturnType<typeof inspectPng>>;
    let rectangles: ReturnType<typeof calculateCropRectangles>;
    try {
      inspected = await inspectPng(input.file.buffer, this.limits);
      rectangles = calculateCropRectangles(
        inspected.width,
        inspected.height,
        input.layout,
      );
    } catch (error) {
      if (error instanceof ImageInspectionError) {
        throw new AppError(error.code, error.message, 400);
      }
      throw error;
    }
    if (rectangles.length > 25) {
      throw new AppError(
        "CONTACT_SHEET_TOO_MANY_CELLS",
        "Preview layouts may contain at most 25 cells.",
        400,
      );
    }
    const duplicate = this.database.db
      .select()
      .from(contactSheetImports)
      .where(
        and(
          eq(contactSheetImports.generationRoundId, round.id),
          eq(contactSheetImports.fileHash, inspected.fileHash),
        ),
      )
      .get();
    if (duplicate) {
      if (duplicate.status !== "PREVIEW") {
        throw new AppError(
          "DUPLICATE_CONTACT_SHEET",
          "This contact-sheet PNG has already been confirmed in the round.",
          409,
        );
      }
      const timestamp = now();
      this.database.db.transaction((tx) => {
        tx.update(contactSheetImports)
          .set({
            ...input.layout,
            cropRectangles: JSON.stringify(rectangles),
          })
          .where(eq(contactSheetImports.id, duplicate.id))
          .run();
        tx.insert(historyEvents)
          .values({
            id: randomUUID(),
            creatureProjectId: creature.id,
            entityType: "ContactSheetImport",
            entityId: duplicate.id,
            action: "CONTACT_SHEET_PREVIEW_UPDATED",
            payload: JSON.stringify({
              layout: input.layout,
              cropCount: rectangles.length,
            }),
            createdAt: timestamp,
          })
          .run();
      });
      return this.getContactSheetPreview(duplicate.id);
    }
    const id = randomUUID();
    const timestamp = now();
    const originalPath = resolveWithin(
      this.workspaceRoot,
      "creatures",
      creature.slug,
      "rounds",
      `round-${String(round.roundNumber).padStart(3, "0")}-${round.roundType.toLowerCase()}`,
      "source-contact-sheets",
      `${id}.png`,
    );
    await mkdir(dirname(originalPath), { recursive: true });
    await writeFile(originalPath, input.file.buffer, { flag: "wx" });
    try {
      this.database.db.transaction((tx) => {
        tx.insert(contactSheetImports)
          .values({
            id,
            generationRoundId: round.id,
            originalPath: toRepositoryRelative(
              this.repositoryRoot,
              originalPath,
            ),
            originalFilename: normalizeOriginalFilename(
              input.file.originalFilename,
            ),
            width: inspected.width,
            height: inspected.height,
            fileHash: inspected.fileHash,
            ...input.layout,
            cropRectangles: JSON.stringify(rectangles),
            status: "PREVIEW",
            createdAt: timestamp,
          })
          .run();
        tx.insert(historyEvents)
          .values({
            id: randomUUID(),
            creatureProjectId: creature.id,
            entityType: "ContactSheetImport",
            entityId: id,
            action: "CONTACT_SHEET_PREVIEWED",
            payload: JSON.stringify({
              layout: input.layout,
              cropCount: rectangles.length,
            }),
            createdAt: timestamp,
          })
          .run();
      });
    } catch (error) {
      await rm(originalPath, { force: true });
      throw error;
    }
    return this.getContactSheetPreview(id);
  }

  getContactSheetPreview(contactSheetId: string): ContactSheetPreview {
    const row = this.database.db
      .select()
      .from(contactSheetImports)
      .where(eq(contactSheetImports.id, contactSheetId))
      .get();
    if (!row) {
      throw new AppError(
        "CONTACT_SHEET_NOT_FOUND",
        "Contact sheet not found.",
        404,
      );
    }
    return {
      id: row.id,
      generationRoundId: row.generationRoundId,
      originalFilename: row.originalFilename,
      width: row.width,
      height: row.height,
      imageUrl: `/api/contact-sheets/${row.id}/image`,
      layout: {
        rows: row.rows,
        columns: row.columns,
        marginTop: row.marginTop,
        marginRight: row.marginRight,
        marginBottom: row.marginBottom,
        marginLeft: row.marginLeft,
        horizontalGap: row.horizontalGap,
        verticalGap: row.verticalGap,
      },
      rectangles: JSON.parse(row.cropRectangles) as ReturnType<
        typeof calculateCropRectangles
      >,
      status: row.status,
      createdAt: row.createdAt,
    };
  }

  async confirmContactSheet(
    contactSheetId: string,
    selectedCropIndexes: number[],
  ): Promise<CandidateView[]> {
    const sheet = this.database.db
      .select()
      .from(contactSheetImports)
      .where(eq(contactSheetImports.id, contactSheetId))
      .get();
    if (!sheet) {
      throw new AppError(
        "CONTACT_SHEET_NOT_FOUND",
        "Contact sheet not found.",
        404,
      );
    }
    if (sheet.status !== "PREVIEW") {
      throw new AppError(
        "CONTACT_SHEET_ALREADY_CONFIRMED",
        "This contact sheet has already been confirmed.",
        409,
      );
    }
    const indexes = [...selectedCropIndexes].sort(
      (left, right) => left - right,
    );
    if (
      indexes.length < 1 ||
      indexes.length > 10 ||
      new Set(indexes).size !== indexes.length
    ) {
      throw new AppError(
        "INVALID_CROP_SELECTION",
        "Select between one and ten unique crops.",
        400,
      );
    }
    const rectangles = JSON.parse(sheet.cropRectangles) as ReturnType<
      typeof calculateCropRectangles
    >;
    const chosen = indexes.map((index) => rectangles[index]);
    if (chosen.some((rectangle) => !rectangle)) {
      throw new AppError(
        "INVALID_CROP_SELECTION",
        "A selected crop does not exist.",
        400,
      );
    }
    const originalPath = fromRepositoryRelative(
      this.repositoryRoot,
      sheet.originalPath,
    );
    assertPathWithin(this.workspaceRoot, originalPath);
    const original = await readFile(originalPath);
    const files = await Promise.all(
      chosen.map(async (rectangle, index) => ({
        buffer: await cropPng(original, rectangle!),
        originalFilename: `${sheet.originalFilename.replace(/\.png$/i, "")}-crop-${String(index + 1).padStart(2, "0")}.png`,
        crop: {
          contactSheetImportId: sheet.id,
          x: rectangle!.x,
          y: rectangle!.y,
          width: rectangle!.width,
          height: rectangle!.height,
        },
      })),
    );
    const round = this.database.db
      .select()
      .from(generationRounds)
      .where(eq(generationRounds.id, sheet.generationRoundId))
      .get();
    if (!round) {
      throw new AppError("ROUND_NOT_FOUND", "Generation round not found.", 404);
    }
    const imported = await this.importCandidates({
      creatureId: round.creatureProjectId,
      roundId: round.id,
      source: "CONTACT_SHEET",
      files,
    });
    const timestamp = now();
    this.database.db.transaction((tx) => {
      tx.update(contactSheetImports)
        .set({ status: "CONFIRMED", confirmedAt: timestamp })
        .where(eq(contactSheetImports.id, sheet.id))
        .run();
      tx.insert(historyEvents)
        .values({
          id: randomUUID(),
          creatureProjectId: round.creatureProjectId,
          entityType: "ContactSheetImport",
          entityId: sheet.id,
          action: "CONTACT_SHEET_CONFIRMED",
          payload: JSON.stringify({ selectedCropIndexes: indexes }),
          createdAt: timestamp,
        })
        .run();
    });
    return imported;
  }

  getContactSheetMedia(contactSheetId: string): {
    path: string;
    mimeType: string;
  } {
    const sheet = this.database.db
      .select()
      .from(contactSheetImports)
      .where(eq(contactSheetImports.id, contactSheetId))
      .get();
    if (!sheet) {
      throw new AppError(
        "CONTACT_SHEET_NOT_FOUND",
        "Contact sheet not found.",
        404,
      );
    }
    const mediaPath = fromRepositoryRelative(
      this.repositoryRoot,
      sheet.originalPath,
    );
    assertPathWithin(this.workspaceRoot, mediaPath);
    return { path: mediaPath, mimeType: "image/png" };
  }

  async readContactSheetOriginal(contactSheetId: string): Promise<Buffer> {
    return readFile(this.getContactSheetMedia(contactSheetId).path);
  }

  getCandidateMedia(
    candidateId: string,
    kind: "image" | "thumbnail",
  ): {
    path: string;
    mimeType: string;
  } {
    const candidate = this.database.db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), isNull(candidates.deletedAt)))
      .get();
    if (!candidate) {
      throw new AppError(
        "CANDIDATE_NOT_FOUND",
        "Candidate image not found.",
        404,
      );
    }
    const storedPath =
      kind === "image" ? candidate.imagePath : candidate.thumbnailPath;
    const mediaPath = fromRepositoryRelative(this.repositoryRoot, storedPath);
    assertPathWithin(this.workspaceRoot, mediaPath);
    return { path: mediaPath, mimeType: "image/png" };
  }

  async readCandidateOriginal(candidateId: string): Promise<Buffer> {
    const media = this.getCandidateMedia(candidateId, "image");
    return readFile(media.path);
  }

  getDesignOverview(creatureId: string): CreatureDesignOverview {
    return this.design.getOverview(creatureId);
  }

  async getDesignManifest(creatureId: string): Promise<DesignManifestView> {
    return this.design.getManifest(creatureId);
  }

  async saveDesignManifest(
    creatureId: string,
    input: DesignManifestInput,
  ): Promise<DesignManifestView> {
    return this.design.saveManifest(creatureId, input);
  }

  async lockDesign(
    creatureId: string,
    input: { candidateId: string; confirmed: boolean; actor: string },
  ): Promise<CreatureDesignOverview> {
    return this.design.lockDesign(creatureId, input);
  }

  unlockDesign(
    creatureId: string,
    input: { confirmed: boolean; actor: string },
  ): CreatureDesignOverview {
    return this.design.unlockDesign(creatureId, input);
  }

  getDesignHistory(creatureId: string): DesignHistoryView[] {
    return this.design.getHistory(creatureId);
  }

  getEvolutionTree(): EvolutionTreeView {
    return this.evolution.getTree();
  }

  getEvolutionContext(creatureId: string): EvolutionContextView {
    return this.evolution.getContext(creatureId);
  }

  async createDescendant(
    parentCreatureId: string,
    input: CreateDescendantInput,
  ): Promise<CreatureDetail> {
    const created = await this.evolution.createDescendant(
      parentCreatureId,
      input,
    );
    return this.getCreature(created.creatureId);
  }

  getReferenceContext(creatureId: string): ReferenceContextView {
    return this.references.getContext(creatureId);
  }

  async createReference(
    creatureId: string,
    input: CreateReferenceInput,
  ): Promise<ReferenceImageView> {
    return this.references.createReference(creatureId, input);
  }

  async importReference(
    referenceId: string,
    file: ReferenceFileInput,
    notes: string,
    actor: string,
  ): Promise<ReferenceImageView> {
    return this.references.importReference(referenceId, file, notes, actor);
  }

  async approveReference(
    referenceId: string,
    input: ApproveReferenceInput,
  ): Promise<ReferenceImageView> {
    return this.references.approveReference(referenceId, input);
  }

  getReferenceMedia(
    referenceId: string,
    kind: "image" | "thumbnail",
  ): { path: string; mimeType: string } {
    return this.references.getMedia(referenceId, kind);
  }

  getReferenceSettings(): ProjectReferenceSettingsView {
    return this.references.getSettings();
  }

  updateReferenceSettings(
    input: ProjectReferenceSettingsInput,
  ): ProjectReferenceSettingsView {
    return this.references.updateSettings(input);
  }

  listAnimations(creatureId: string): AnimationView[] {
    return this.animation.list(creatureId);
  }

  getAnimation(animationId: string): AnimationView {
    return this.animation.get(animationId);
  }

  createAnimation(
    creatureId: string,
    input: CreateAnimationInput,
  ): Promise<AnimationView> {
    return this.animation.create(creatureId, input);
  }

  updateAnimationSettings(
    animationId: string,
    input: AnimationSettingsInput,
  ): AnimationView {
    return this.animation.updateSettings(animationId, input);
  }

  importAnimationFrames(
    animationId: string,
    files: AnimationFileInput[],
    frameRole: FrameRole,
    source: string,
    actor: string,
  ): Promise<AnimationView> {
    return this.animation.importFrames(
      animationId,
      files,
      frameRole,
      source,
      actor,
    );
  }

  reorderAnimationFrames(
    animationId: string,
    input: ReorderAnimationFramesInput,
  ): AnimationView {
    return this.animation.reorder(animationId, input);
  }

  updateAnimationFrame(
    frameId: string,
    input: UpdateAnimationFrameInput,
  ): AnimationView {
    return this.animation.updateFrame(frameId, input);
  }

  deleteAnimationFrame(
    frameId: string,
    confirmed: boolean,
    actor: string,
  ): AnimationView {
    return this.animation.deleteFrame(frameId, confirmed, actor);
  }

  createIntermediateAnimationPrompt(
    animationId: string,
    actor: string,
  ): Promise<AnimationView> {
    return this.animation.createIntermediatePrompt(animationId, actor);
  }

  createAnimationRepairPrompt(
    frameId: string,
    input: RepairPromptInput,
  ): Promise<AnimationView> {
    return this.animation.createRepairPrompt(frameId, input);
  }

  replaceAnimationFrame(
    frameId: string,
    file: AnimationFileInput,
    notes: string,
    actor: string,
  ): Promise<AnimationView> {
    return this.animation.replaceFrame(frameId, file, notes, actor);
  }

  approveAnimation(
    animationId: string,
    input: ApproveAnimationInput,
  ): AnimationView {
    return this.animation.approve(animationId, input);
  }

  getAnimationFrameMedia(
    frameId: string,
    kind: "image" | "thumbnail",
  ): { path: string; mimeType: string } {
    return this.animation.getMedia(frameId, kind);
  }

  setCandidateRejected(candidateId: string, rejected: boolean): void {
    this.design.setCandidateRejected(candidateId, rejected);
  }

  deleteCandidate(candidateId: string, confirmed: boolean): void {
    this.design.deleteCandidate(candidateId, confirmed);
  }

  deleteRound(roundId: string, confirmed: boolean): void {
    this.design.deleteRound(roundId, confirmed);
  }

  getLockedDesignMedia(creatureId: string): {
    path: string;
    mimeType: string;
  } {
    return this.design.getLockedDesignMedia(creatureId);
  }
}
