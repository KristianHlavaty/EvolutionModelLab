import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  candidates,
  createDatabase,
  creatureProjects,
  generationRounds,
  historyEvents,
  projectSettings,
  type DatabaseHandle,
} from "@eml/database";
import {
  ImageInspectionError,
  inspectPng,
  normalizeOriginalFilename,
  type ImageLimits,
} from "@eml/image-processing";
import { buildConceptPrompt } from "@eml/prompt-builder";
import {
  createCreatureInputSchema,
  type CandidateSource,
  type CreateCreatureInput,
} from "@eml/shared";
import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";

import { AppError } from "./errors.js";
import {
  assertPathWithin,
  fromRepositoryRelative,
  resolveWithin,
  toRepositoryRelative,
} from "./paths.js";

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
  thumbnailUrl: string;
  imageUrl: string;
  createdAt: string;
}

export interface CreatureSummary {
  id: string;
  slug: string;
  displayName: string;
  scientificName: string | null;
  description: string;
  generationBrief: string;
  status: string;
  currentRoundId: string | null;
  createdAt: string;
  updatedAt: string;
  selectedCandidate: CandidateView | null;
  roundCount: number;
}

export interface RoundView {
  id: string;
  creatureProjectId: string;
  roundNumber: number;
  roundType: string;
  generatedPrompt: string;
  createdAt: string;
  candidates: CandidateView[];
}

export interface CreatureDetail extends CreatureSummary {
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
>;

function candidateToView(candidate: CandidateViewSource): CandidateView {
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
    thumbnailUrl: `/api/candidates/${candidate.id}/thumbnail`,
    imageUrl: `/api/candidates/${candidate.id}/image`,
    createdAt: candidate.createdAt,
  };
}

export class EvolutionModelLabService {
  public readonly repositoryRoot: string;
  public readonly workspaceRoot: string;
  public readonly exportsRoot: string;
  private readonly database: DatabaseHandle;
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
    const creatureRoot = resolveWithin(this.workspaceRoot, "creatures", slug);
    const manifestPath = resolveWithin(creatureRoot, "manifest.json");

    await mkdir(resolveWithin(creatureRoot, "history"), { recursive: true });
    await mkdir(resolveWithin(creatureRoot, "references"), { recursive: true });
    await mkdir(resolveWithin(creatureRoot, "rounds"), { recursive: true });
    await mkdir(resolveWithin(creatureRoot, "animations"), { recursive: true });
    await mkdir(resolveWithin(creatureRoot, "exports"), { recursive: true });

    try {
      await writeFile(
        manifestPath,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            creature: {
              id,
              slug,
              displayName: parsed.displayName,
              scientificName: parsed.scientificName ?? null,
              status: "DRAFT",
            },
            createdAt: timestamp,
          },
          null,
          2,
        )}\n`,
        { encoding: "utf8", flag: "wx" },
      );

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
      const selected = creature.currentRoundId
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
      return {
        id: creature.id,
        slug: creature.slug,
        displayName: creature.displayName,
        scientificName: creature.scientificName,
        description: creature.description,
        generationBrief: creature.generationBrief,
        status: creature.status,
        currentRoundId: creature.currentRoundId,
        createdAt: creature.createdAt,
        updatedAt: creature.updatedAt,
        selectedCandidate: selected ? candidateToView(selected) : null,
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
    const selected = currentCandidates.find((candidate) => candidate.selected);

    return {
      id: creature.id,
      slug: creature.slug,
      displayName: creature.displayName,
      scientificName: creature.scientificName,
      description: creature.description,
      generationBrief: creature.generationBrief,
      status: creature.status,
      currentRoundId: creature.currentRoundId,
      createdAt: creature.createdAt,
      updatedAt: creature.updatedAt,
      selectedCandidate: selected ? candidateToView(selected) : null,
      roundCount: rounds.length,
      rounds,
      currentRound: currentRoundRow
        ? {
            id: currentRoundRow.id,
            creatureProjectId: currentRoundRow.creatureProjectId,
            roundNumber: currentRoundRow.roundNumber,
            roundType: currentRoundRow.roundType,
            generatedPrompt: currentRoundRow.generatedPrompt,
            createdAt: currentRoundRow.createdAt,
            candidates: currentCandidates.map(candidateToView),
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
      candidates: candidateRows.map(candidateToView),
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
    if (round.roundType !== "CONCEPT") {
      throw new AppError(
        "INVALID_ROUND_TYPE",
        "Milestone 1 accepts candidates only for concept rounds.",
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
              input.source === "CLIPBOARD"
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

    return rows.map((row) => candidateToView(row));
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
        .set({ status: "CANDIDATE_SELECTED", updatedAt: timestamp })
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

    return candidateToView({ ...candidate, selected: true });
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
}
