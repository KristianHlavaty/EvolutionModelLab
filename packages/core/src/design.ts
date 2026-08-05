import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname } from "node:path";

import {
  candidates,
  creatureProjects,
  designLocks,
  designManifests,
  designManifestVersions,
  generationRounds,
  historyEvents,
  projectSettings,
  type AppDatabase,
} from "@eml/database";
import {
  ImageInspectionError,
  inspectPng,
  type ImageLimits,
} from "@eml/image-processing";
import {
  designManifestFieldNames,
  designManifestInputSchema,
  type DesignManifestInput,
} from "@eml/shared";
import { and, desc, eq, isNull } from "drizzle-orm";

import { AppError } from "./errors.js";
import {
  assertPathWithin,
  fromRepositoryRelative,
  resolveWithin,
  toRepositoryRelative,
} from "./paths.js";

type CreatureRow = typeof creatureProjects.$inferSelect;
type ManifestRow = typeof designManifests.$inferSelect;
type LockRow = typeof designLocks.$inferSelect;

export interface DesignManifestView {
  id: string;
  creatureProjectId: string;
  version: number;
  immutableFeatures: string[];
  preferredFeatures: string[];
  forbiddenFeatures: string[];
  anatomyNotes: string;
  biologicalNotes: string;
  styleNotes: string;
  paletteNotes: string;
  textureNotes: string;
  cameraNotes: string;
  lightingNotes: string;
  animationNotes: string;
  canvasWidth: number;
  canvasHeight: number;
  facing: "left" | "right" | "front" | "back";
  anchorX: number;
  anchorY: number;
  transparentBackgroundRequired: boolean;
  explicitFields: string[];
  createdAt: string;
  updatedAt: string;
  lockedSnapshotVersion: number | null;
  lockedMismatchWarningRequired: boolean;
}

export interface DesignLockView {
  id: string;
  creatureProjectId: string;
  lockNumber: number;
  candidateId: string;
  candidateNumber: number;
  candidateImageUrl: string;
  generationRoundId: string;
  roundNumber: number;
  manifestVersion: number;
  status: string;
  activeReferencePath: string;
  archivedReferencePath: string | null;
  lockedAt: string;
  unlockedAt: string | null;
  actor: string | null;
}

export interface DesignHistoryView {
  id: string;
  timestamp: string;
  action: string;
  creature: { id: string; displayName: string };
  candidate: { id: string; candidateNumber: number } | null;
  round: { id: string; roundNumber: number } | null;
  manifestVersion: number | null;
  actor: string | null;
  details: Record<string, unknown>;
}

export interface CreatureDesignOverview {
  manifest: DesignManifestView | null;
  activeLock: DesignLockView | null;
  lockHistory: DesignLockView[];
}

const manifestDataFields = designManifestFieldNames;

function timestamp(): string {
  return new Date().toISOString();
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

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function nodeErrorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") return false;
    throw error;
  }
}

function padVersion(version: number): string {
  return String(version).padStart(3, "0");
}

function dataFromRow(
  row: ManifestRow,
): Omit<
  DesignManifestView,
  "lockedSnapshotVersion" | "lockedMismatchWarningRequired"
> {
  const facing = ["left", "right", "front", "back"].includes(row.facing)
    ? (row.facing as DesignManifestView["facing"])
    : "right";
  return {
    id: row.id,
    creatureProjectId: row.creatureProjectId,
    version: row.version,
    immutableFeatures: parseList(row.immutableFeatures),
    preferredFeatures: parseList(row.preferredFeatures),
    forbiddenFeatures: parseList(row.forbiddenFeatures),
    anatomyNotes: row.anatomyNotes,
    biologicalNotes: row.biologicalNotes,
    styleNotes: row.styleNotes,
    paletteNotes: row.paletteNotes,
    textureNotes: row.textureNotes,
    cameraNotes: row.cameraNotes,
    lightingNotes: row.lightingNotes,
    animationNotes: row.animationNotes,
    canvasWidth: row.canvasWidth,
    canvasHeight: row.canvasHeight,
    facing,
    anchorX: row.anchorX,
    anchorY: row.anchorY,
    transparentBackgroundRequired: row.transparentBackgroundRequired,
    explicitFields: parseList(row.explicitFields),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function manifestFilePayload(
  manifest: Omit<
    DesignManifestView,
    "lockedSnapshotVersion" | "lockedMismatchWarningRequired"
  >,
): Record<string, unknown> {
  return { schemaVersion: 3, ...manifest };
}

function serializeManifest(
  manifest: Omit<
    DesignManifestView,
    "lockedSnapshotVersion" | "lockedMismatchWarningRequired"
  >,
): string {
  return `${JSON.stringify(manifestFilePayload(manifest), null, 2)}\n`;
}

function manifestValues(input: DesignManifestInput, updatedAt: string) {
  return {
    immutableFeatures: JSON.stringify(input.immutableFeatures),
    preferredFeatures: JSON.stringify(input.preferredFeatures),
    forbiddenFeatures: JSON.stringify(input.forbiddenFeatures),
    anatomyNotes: input.anatomyNotes,
    biologicalNotes: input.biologicalNotes,
    styleNotes: input.styleNotes,
    paletteNotes: input.paletteNotes,
    textureNotes: input.textureNotes,
    cameraNotes: input.cameraNotes,
    lightingNotes: input.lightingNotes,
    animationNotes: input.animationNotes,
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
    facing: input.facing,
    anchorX: input.anchorX,
    anchorY: input.anchorY,
    transparentBackgroundRequired: input.transparentBackgroundRequired,
    explicitFields: JSON.stringify(input.explicitFields),
    updatedAt,
  };
}

function changedManifestFields(
  current: ReturnType<typeof dataFromRow>,
  input: DesignManifestInput,
): string[] {
  return manifestDataFields.filter((field) => {
    const currentValue = current[field];
    const nextValue = input[field];
    return JSON.stringify(currentValue) !== JSON.stringify(nextValue);
  });
}

export class DesignWorkflow {
  constructor(
    private readonly db: AppDatabase,
    private readonly repositoryRoot: string,
    private readonly workspaceRoot: string,
    private readonly limits: ImageLimits,
  ) {}

  buildInitialManifest(
    creatureProjectId: string,
    createdAt: string,
  ): { row: typeof designManifests.$inferInsert; serialized: string } {
    const settings = this.db
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
    const row = {
      id: randomUUID(),
      creatureProjectId,
      version: 0,
      immutableFeatures: "[]",
      preferredFeatures: "[]",
      forbiddenFeatures: "[]",
      anatomyNotes: "",
      biologicalNotes: "",
      styleNotes: "",
      paletteNotes: "",
      textureNotes: "",
      cameraNotes: "",
      lightingNotes: "",
      animationNotes: "",
      canvasWidth: settings.defaultCanvasWidth,
      canvasHeight: settings.defaultCanvasHeight,
      facing: settings.defaultFacing,
      anchorX: Math.floor(settings.defaultCanvasWidth / 2),
      anchorY: settings.defaultCanvasHeight - 1,
      transparentBackgroundRequired: settings.requireTransparency,
      explicitFields: "[]",
      createdAt,
      updatedAt: createdAt,
    } satisfies typeof designManifests.$inferInsert;
    return {
      row,
      serialized: serializeManifest(dataFromRow(row as ManifestRow)),
    };
  }

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
    if (!creature) {
      throw new AppError(
        "CREATURE_NOT_FOUND",
        "Creature project not found.",
        404,
      );
    }
    return creature;
  }

  private manifestRow(creatureId: string): ManifestRow {
    const row = this.db
      .select()
      .from(designManifests)
      .where(eq(designManifests.creatureProjectId, creatureId))
      .get();
    if (!row) {
      throw new AppError(
        "MANIFEST_NOT_FOUND",
        "Design manifest not found. Run the Milestone 3 migration and retry.",
        500,
      );
    }
    return row;
  }

  private activeLockRow(creatureId: string): LockRow | undefined {
    return this.db
      .select()
      .from(designLocks)
      .where(
        and(
          eq(designLocks.creatureProjectId, creatureId),
          eq(designLocks.status, "ACTIVE"),
        ),
      )
      .get();
  }

  hasActiveLock(creatureId: string): boolean {
    return Boolean(this.activeLockRow(creatureId));
  }

  isCandidateLocked(candidateId: string): boolean {
    return Boolean(
      this.db
        .select({ id: designLocks.id })
        .from(designLocks)
        .where(
          and(
            eq(designLocks.candidateId, candidateId),
            eq(designLocks.status, "ACTIVE"),
          ),
        )
        .get(),
    );
  }

  private manifestView(row: ManifestRow): DesignManifestView {
    const active = this.activeLockRow(row.creatureProjectId);
    return {
      ...dataFromRow(row),
      lockedSnapshotVersion: active?.manifestVersion ?? null,
      lockedMismatchWarningRequired: Boolean(active),
    };
  }

  private lockView(row: LockRow): DesignLockView {
    const candidate = this.db
      .select({ candidateNumber: candidates.candidateNumber })
      .from(candidates)
      .where(eq(candidates.id, row.candidateId))
      .get();
    const round = this.db
      .select({ roundNumber: generationRounds.roundNumber })
      .from(generationRounds)
      .where(eq(generationRounds.id, row.generationRoundId))
      .get();
    return {
      id: row.id,
      creatureProjectId: row.creatureProjectId,
      lockNumber: row.lockNumber,
      candidateId: row.candidateId,
      candidateNumber: candidate?.candidateNumber ?? 0,
      candidateImageUrl: `/api/candidates/${row.candidateId}/image`,
      generationRoundId: row.generationRoundId,
      roundNumber: round?.roundNumber ?? 0,
      manifestVersion: row.manifestVersion,
      status: row.status,
      activeReferencePath: row.activeReferencePath,
      archivedReferencePath: row.archivedReferencePath,
      lockedAt: row.lockedAt,
      unlockedAt: row.unlockedAt,
      actor: row.actor,
    };
  }

  getOverview(creatureId: string): CreatureDesignOverview {
    const manifest = this.db
      .select()
      .from(designManifests)
      .where(eq(designManifests.creatureProjectId, creatureId))
      .get();
    const locks = this.db
      .select()
      .from(designLocks)
      .where(eq(designLocks.creatureProjectId, creatureId))
      .orderBy(desc(designLocks.lockNumber))
      .all();
    return {
      manifest: manifest ? this.manifestView(manifest) : null,
      activeLock: locks.find((lock) => lock.status === "ACTIVE")
        ? this.lockView(locks.find((lock) => lock.status === "ACTIVE")!)
        : null,
      lockHistory: locks.map((lock) => this.lockView(lock)),
    };
  }

  async getManifest(creatureId: string): Promise<DesignManifestView> {
    const creature = this.creature(creatureId);
    const row = this.manifestRow(creatureId);
    const currentPath = this.currentManifestPath(creature);
    await this.writeCurrentManifest(
      currentPath,
      serializeManifest(dataFromRow(row)),
    );
    return this.manifestView(row);
  }

  async saveManifest(
    creatureId: string,
    input: DesignManifestInput,
  ): Promise<DesignManifestView> {
    const parsed = designManifestInputSchema.parse(input);
    const creature = this.creature(creatureId);
    const row = this.manifestRow(creatureId);
    const current = dataFromRow(row);
    const changedFields = changedManifestFields(current, parsed);
    const explicitChanged =
      JSON.stringify(current.explicitFields) !==
      JSON.stringify(parsed.explicitFields);
    if (changedFields.length === 0 && !explicitChanged)
      return this.manifestView(row);

    const active = this.activeLockRow(creatureId);
    if (active && !parsed.confirmedLockedMismatch) {
      throw new AppError(
        "MANIFEST_LOCK_CONFIRMATION_REQUIRED",
        "Confirm that this manifest change may no longer match the frozen locked design.",
        409,
        { changedFields, lockedManifestVersion: active.manifestVersion },
      );
    }
    const updatedAt = timestamp();
    const nextVersion = active ? row.version + 1 : row.version;
    const nextRow = {
      ...row,
      ...manifestValues(parsed, updatedAt),
      version: nextVersion,
    } as ManifestRow;
    const serialized = serializeManifest(dataFromRow(nextRow));
    const currentPath = this.currentManifestPath(creature);
    const snapshotPath = active
      ? this.manifestSnapshotPath(creature, nextVersion)
      : null;
    const snapshotRelative = snapshotPath
      ? toRepositoryRelative(this.repositoryRoot, snapshotPath)
      : null;
    const versionId = active ? randomUUID() : null;
    let currentBackup: string | null | undefined;
    let snapshotWritten = false;
    try {
      await mkdir(dirname(currentPath), { recursive: true });
      if (snapshotPath) {
        await mkdir(dirname(snapshotPath), { recursive: true });
        await writeFile(snapshotPath, serialized, {
          encoding: "utf8",
          flag: "wx",
        });
        snapshotWritten = true;
      }
      currentBackup = await this.replaceCurrentManifest(
        currentPath,
        serialized,
      );
      this.db.transaction((tx) => {
        tx.update(designManifests)
          .set({ ...manifestValues(parsed, updatedAt), version: nextVersion })
          .where(eq(designManifests.id, row.id))
          .run();
        tx.update(creatureProjects)
          .set({ updatedAt })
          .where(eq(creatureProjects.id, creatureId))
          .run();
        tx.insert(historyEvents)
          .values({
            id: randomUUID(),
            creatureProjectId: creatureId,
            entityType: "DesignManifest",
            entityId: row.id,
            action: "MANIFEST_UPDATED",
            payload: JSON.stringify({ changedFields }),
            manifestVersion: nextVersion,
            actor: parsed.actor,
            createdAt: updatedAt,
          })
          .run();
        if (active && snapshotRelative && versionId) {
          tx.insert(designManifestVersions)
            .values({
              id: versionId,
              designManifestId: row.id,
              creatureProjectId: creatureId,
              version: nextVersion,
              snapshot: serialized,
              snapshotPath: snapshotRelative,
              reason: "POST_LOCK_EDIT",
              actor: parsed.actor,
              createdAt: updatedAt,
            })
            .run();
          tx.insert(historyEvents)
            .values({
              id: randomUUID(),
              creatureProjectId: creatureId,
              entityType: "DesignManifestVersion",
              entityId: versionId,
              action: "MANIFEST_VERSION_FROZEN",
              payload: JSON.stringify({
                reason: "POST_LOCK_EDIT",
                snapshotPath: snapshotRelative,
                lockedSnapshotUnchanged: active.manifestVersion,
              }),
              manifestVersion: nextVersion,
              actor: parsed.actor,
              createdAt: updatedAt,
            })
            .run();
        }
      });
    } catch (error) {
      if (currentBackup !== undefined)
        await this.restoreCurrentManifest(currentPath, currentBackup);
      if (snapshotWritten && snapshotPath)
        await rm(snapshotPath, { force: true });
      if (error instanceof AppError) throw error;
      if (nodeErrorCode(error) === "EEXIST") {
        throw new AppError(
          "MANIFEST_SNAPSHOT_EXISTS",
          "The next manifest history file already exists; no changes were saved.",
          409,
        );
      }
      throw new AppError(
        "MANIFEST_SAVE_FAILED",
        "The manifest could not be saved consistently; previous data was restored.",
        500,
      );
    }
    if (currentBackup) await rm(currentBackup, { force: true });
    return this.manifestView(nextRow);
  }

  async lockDesign(
    creatureId: string,
    input: { candidateId: string; confirmed: boolean; actor: string },
  ): Promise<CreatureDesignOverview> {
    if (!input.confirmed) {
      throw new AppError(
        "DESIGN_LOCK_CONFIRMATION_REQUIRED",
        "Explicitly confirm the authoritative design lock before continuing.",
        409,
      );
    }
    const creature = this.creature(creatureId);
    if (this.activeLockRow(creatureId) || creature.lockedCandidateId) {
      throw new AppError(
        "DESIGN_ALREADY_LOCKED",
        "Unlock the active design before locking another candidate.",
        409,
      );
    }
    const candidate = this.db
      .select()
      .from(candidates)
      .where(eq(candidates.id, input.candidateId))
      .get();
    if (!candidate) {
      throw new AppError("CANDIDATE_NOT_FOUND", "Candidate not found.", 404);
    }
    if (candidate.deletedAt) {
      throw new AppError(
        "CANDIDATE_DELETED",
        "A deleted candidate cannot be locked.",
        409,
      );
    }
    const round = this.db
      .select()
      .from(generationRounds)
      .where(eq(generationRounds.id, candidate.generationRoundId))
      .get();
    if (!round || round.creatureProjectId !== creatureId) {
      throw new AppError(
        "CANDIDATE_WRONG_CREATURE",
        "The requested candidate does not belong to this creature.",
        409,
      );
    }
    if (candidate.rejected) {
      throw new AppError(
        "CANDIDATE_REJECTED",
        "A rejected candidate cannot be locked.",
        409,
      );
    }
    if (
      round.deletedAt ||
      creature.currentRoundId !== round.id ||
      !candidate.selected
    ) {
      throw new AppError(
        "LOCK_SELECTED_CANDIDATE_REQUIRED",
        "Select one active candidate in the creature's current round before locking.",
        409,
      );
    }

    const sourcePath = fromRepositoryRelative(
      this.repositoryRoot,
      candidate.imagePath,
    );
    assertPathWithin(this.workspaceRoot, sourcePath);
    let sourceBytes: Buffer;
    try {
      sourceBytes = await readFile(sourcePath);
    } catch (error) {
      if (nodeErrorCode(error) === "ENOENT") {
        throw new AppError(
          "CANDIDATE_SOURCE_MISSING",
          "The selected candidate file is missing; the design was not locked.",
          409,
          { candidateId: candidate.id },
        );
      }
      throw error;
    }
    try {
      const inspected = await inspectPng(sourceBytes, this.limits);
      if (inspected.fileHash !== candidate.fileHash) {
        throw new AppError(
          "CANDIDATE_HASH_MISMATCH",
          "The selected candidate bytes no longer match the imported original.",
          409,
          { expected: candidate.fileHash, actual: inspected.fileHash },
        );
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof ImageInspectionError) {
        throw new AppError(
          "CANDIDATE_SOURCE_INVALID",
          "The selected candidate is no longer a valid PNG.",
          409,
          { reason: error.code },
        );
      }
      throw error;
    }

    const manifest = this.manifestRow(creatureId);
    const lockRows = this.db
      .select()
      .from(designLocks)
      .where(eq(designLocks.creatureProjectId, creatureId))
      .orderBy(desc(designLocks.lockNumber))
      .all();
    const previous = lockRows[0];
    const lockNumber = (previous?.lockNumber ?? 0) + 1;
    const nextManifestVersion = manifest.version + 1;
    const lockedAt = timestamp();
    const versionId = randomUUID();
    const lockId = randomUUID();
    const nextManifest = {
      ...dataFromRow(manifest),
      version: nextManifestVersion,
      updatedAt: lockedAt,
    };
    const manifestSerialized = serializeManifest(nextManifest);
    const currentManifestPath = this.currentManifestPath(creature);
    const snapshotPath = this.manifestSnapshotPath(
      creature,
      nextManifestVersion,
    );
    const activePath = resolveWithin(
      this.workspaceRoot,
      "creatures",
      creature.slug,
      "references",
      "locked-design.png",
    );
    const archivePath = previous
      ? resolveWithin(
          this.workspaceRoot,
          "creatures",
          creature.slug,
          "history",
          "locked-designs",
          `locked-design-v${padVersion(previous.lockNumber)}.png`,
        )
      : null;
    const activeExists = await exists(activePath);
    if (!previous && activeExists) {
      throw new AppError(
        "ACTIVE_LOCKED_DESIGN_EXISTS",
        "An untracked active locked-design file already exists; it was not replaced.",
        409,
      );
    }
    if (previous) {
      if (previous.status === "ACTIVE") {
        throw new AppError(
          "DESIGN_ALREADY_LOCKED",
          "Unlock the active design first.",
          409,
        );
      }
      if (!activeExists) {
        throw new AppError(
          "PREVIOUS_LOCKED_REFERENCE_MISSING",
          "The previous active locked reference is missing; relocking was stopped.",
          409,
        );
      }
      const activeBytes = await readFile(activePath);
      const activeInspection = await inspectPng(activeBytes, this.limits);
      if (activeInspection.fileHash !== previous.sourceFileHash) {
        throw new AppError(
          "ACTIVE_LOCKED_REFERENCE_MISMATCH",
          "The active locked reference no longer matches the previous lock record.",
          409,
        );
      }
    }

    const snapshotRelative = toRepositoryRelative(
      this.repositoryRoot,
      snapshotPath,
    );
    const activeRelative = toRepositoryRelative(
      this.repositoryRoot,
      activePath,
    );
    const archiveRelative = archivePath
      ? toRepositoryRelative(this.repositoryRoot, archivePath)
      : null;
    const activeTemp = resolveWithin(
      dirname(activePath),
      `.${basename(activePath)}.${randomUUID()}.tmp`,
    );
    let activeBackup: string | null = null;
    let manifestBackup: string | null | undefined;
    let snapshotWritten = false;
    let archiveWritten = false;
    let activeInstalled = false;
    try {
      await mkdir(dirname(activePath), { recursive: true });
      await mkdir(dirname(snapshotPath), { recursive: true });
      if (archivePath) await mkdir(dirname(archivePath), { recursive: true });
      await writeFile(activeTemp, sourceBytes, { flag: "wx" });
      await writeFile(snapshotPath, manifestSerialized, {
        encoding: "utf8",
        flag: "wx",
      });
      snapshotWritten = true;
      if (archivePath) {
        await copyFile(activePath, archivePath, fsConstants.COPYFILE_EXCL);
        archiveWritten = true;
        activeBackup = resolveWithin(
          dirname(activePath),
          `.${basename(activePath)}.${randomUUID()}.bak`,
        );
        await rename(activePath, activeBackup);
      }
      await rename(activeTemp, activePath);
      activeInstalled = true;
      manifestBackup = await this.replaceCurrentManifest(
        currentManifestPath,
        manifestSerialized,
      );

      this.db.transaction((tx) => {
        tx.insert(designManifestVersions)
          .values({
            id: versionId,
            designManifestId: manifest.id,
            creatureProjectId: creatureId,
            version: nextManifestVersion,
            snapshot: manifestSerialized,
            snapshotPath: snapshotRelative,
            reason: "DESIGN_LOCK",
            actor: input.actor,
            createdAt: lockedAt,
          })
          .run();
        if (previous && archiveRelative) {
          tx.update(designLocks)
            .set({
              archivedReferencePath: archiveRelative,
              status: "SUPERSEDED",
            })
            .where(eq(designLocks.id, previous.id))
            .run();
          tx.insert(historyEvents)
            .values({
              id: randomUUID(),
              creatureProjectId: creatureId,
              entityType: "DesignLock",
              entityId: previous.id,
              action: "PREVIOUS_LOCKED_REFERENCE_ARCHIVED",
              payload: JSON.stringify({
                archivedReferencePath: archiveRelative,
              }),
              candidateId: previous.candidateId,
              generationRoundId: previous.generationRoundId,
              manifestVersion: previous.manifestVersion,
              actor: input.actor,
              createdAt: lockedAt,
            })
            .run();
        }
        tx.update(designManifests)
          .set({ version: nextManifestVersion, updatedAt: lockedAt })
          .where(eq(designManifests.id, manifest.id))
          .run();
        tx.insert(designLocks)
          .values({
            id: lockId,
            creatureProjectId: creatureId,
            lockNumber,
            candidateId: candidate.id,
            generationRoundId: round.id,
            manifestVersionId: versionId,
            manifestVersion: nextManifestVersion,
            status: "ACTIVE",
            activeReferencePath: activeRelative,
            sourceFileHash: candidate.fileHash,
            actor: input.actor,
            lockedAt,
          })
          .run();
        tx.update(creatureProjects)
          .set({
            status: "DESIGN_LOCKED",
            lockedCandidateId: candidate.id,
            updatedAt: lockedAt,
          })
          .where(eq(creatureProjects.id, creatureId))
          .run();
        tx.insert(historyEvents)
          .values([
            {
              id: randomUUID(),
              creatureProjectId: creatureId,
              entityType: "DesignManifestVersion",
              entityId: versionId,
              action: "MANIFEST_VERSION_FROZEN",
              payload: JSON.stringify({
                reason: "DESIGN_LOCK",
                snapshotPath: snapshotRelative,
              }),
              candidateId: candidate.id,
              generationRoundId: round.id,
              manifestVersion: nextManifestVersion,
              actor: input.actor,
              createdAt: lockedAt,
            },
            {
              id: randomUUID(),
              creatureProjectId: creatureId,
              entityType: "DesignLock",
              entityId: lockId,
              action: "DESIGN_LOCKED",
              payload: JSON.stringify({
                lockNumber,
                candidateNumber: candidate.candidateNumber,
                activeReferencePath: activeRelative,
              }),
              candidateId: candidate.id,
              generationRoundId: round.id,
              manifestVersion: nextManifestVersion,
              actor: input.actor,
              createdAt: lockedAt,
            },
          ])
          .run();
        if (previous) {
          tx.insert(historyEvents)
            .values({
              id: randomUUID(),
              creatureProjectId: creatureId,
              entityType: "DesignLock",
              entityId: lockId,
              action: "LOCKED_DESIGN_REPLACED",
              payload: JSON.stringify({
                previousLockId: previous.id,
                newLockId: lockId,
              }),
              candidateId: candidate.id,
              generationRoundId: round.id,
              manifestVersion: nextManifestVersion,
              actor: input.actor,
              createdAt: lockedAt,
            })
            .run();
        }
      });
    } catch (error) {
      if (activeInstalled) await rm(activePath, { force: true });
      if (activeBackup)
        await rename(activeBackup, activePath).catch(() => undefined);
      if (manifestBackup !== undefined)
        await this.restoreCurrentManifest(currentManifestPath, manifestBackup);
      if (snapshotWritten) await rm(snapshotPath, { force: true });
      if (archiveWritten && archivePath) await rm(archivePath, { force: true });
      await rm(activeTemp, { force: true });
      if (error instanceof AppError) throw error;
      const code = nodeErrorCode(error);
      if (code === "EEXIST") {
        throw new AppError(
          "LOCK_DESTINATION_EXISTS",
          "A versioned lock artifact already exists; nothing was replaced.",
          409,
        );
      }
      throw new AppError(
        "DESIGN_LOCK_FAILED",
        "The design lock failed and all staged changes were rolled back.",
        500,
        { filesystemCode: code },
      );
    }
    if (activeBackup) await rm(activeBackup, { force: true });
    if (manifestBackup) await rm(manifestBackup, { force: true });
    return this.getOverview(creatureId);
  }

  unlockDesign(
    creatureId: string,
    input: { confirmed: boolean; actor: string },
  ): CreatureDesignOverview {
    if (!input.confirmed) {
      throw new AppError(
        "DESIGN_UNLOCK_CONFIRMATION_REQUIRED",
        "Explicitly confirm the design unlock before continuing.",
        409,
      );
    }
    const creature = this.creature(creatureId);
    const active = this.activeLockRow(creatureId);
    if (!active || !creature.lockedCandidateId) {
      throw new AppError(
        "DESIGN_NOT_LOCKED",
        "This creature has no active design lock.",
        409,
      );
    }
    const unlockedAt = timestamp();
    this.db.transaction((tx) => {
      tx.insert(historyEvents)
        .values({
          id: randomUUID(),
          creatureProjectId: creatureId,
          entityType: "DesignLock",
          entityId: active.id,
          action: "DESIGN_UNLOCK_REQUESTED",
          payload: JSON.stringify({ consequencesAcknowledged: true }),
          candidateId: active.candidateId,
          generationRoundId: active.generationRoundId,
          manifestVersion: active.manifestVersion,
          actor: input.actor,
          createdAt: unlockedAt,
        })
        .run();
      tx.update(designLocks)
        .set({ status: "UNLOCKED", unlockedAt })
        .where(eq(designLocks.id, active.id))
        .run();
      tx.update(creatureProjects)
        .set({
          status: "REFINING",
          lockedCandidateId: null,
          updatedAt: unlockedAt,
        })
        .where(eq(creatureProjects.id, creatureId))
        .run();
      tx.insert(historyEvents)
        .values({
          id: randomUUID(),
          creatureProjectId: creatureId,
          entityType: "DesignLock",
          entityId: active.id,
          action: "DESIGN_UNLOCKED",
          payload: JSON.stringify({
            activeReferencePreserved: active.activeReferencePath,
            transitionStatus: "REFINING",
          }),
          candidateId: active.candidateId,
          generationRoundId: active.generationRoundId,
          manifestVersion: active.manifestVersion,
          actor: input.actor,
          createdAt: unlockedAt,
        })
        .run();
    });
    return this.getOverview(creatureId);
  }

  setCandidateRejected(candidateId: string, rejected: boolean): void {
    const candidate = this.candidateForProtectedOperation(candidateId);
    if (this.isCandidateLocked(candidate.id)) {
      this.recordProtectedOperation(
        candidate.creatureId,
        candidate.id,
        candidate.roundId,
        "REJECT_LOCKED_CANDIDATE",
      );
      throw new AppError(
        "LOCKED_CANDIDATE_PROTECTED",
        "The authoritative locked candidate cannot be rejected.",
        409,
      );
    }
    if (candidate.selected && rejected) {
      throw new AppError(
        "SELECTED_CANDIDATE_PROTECTED",
        "Choose another candidate before rejecting the selected candidate.",
        409,
      );
    }
    this.db
      .update(candidates)
      .set({ rejected })
      .where(eq(candidates.id, candidate.id))
      .run();
  }

  deleteCandidate(candidateId: string, confirmed: boolean): void {
    if (!confirmed) {
      throw new AppError(
        "DELETE_CONFIRMATION_REQUIRED",
        "Explicitly confirm candidate deletion.",
        409,
      );
    }
    const candidate = this.candidateForProtectedOperation(candidateId);
    if (this.isCandidateLocked(candidate.id)) {
      this.recordProtectedOperation(
        candidate.creatureId,
        candidate.id,
        candidate.roundId,
        "DELETE_LOCKED_CANDIDATE",
      );
      throw new AppError(
        "LOCKED_CANDIDATE_PROTECTED",
        "The authoritative locked candidate cannot be deleted.",
        409,
      );
    }
    if (candidate.selected) {
      throw new AppError(
        "SELECTED_CANDIDATE_PROTECTED",
        "Choose another candidate before deleting the selected candidate.",
        409,
      );
    }
    this.db
      .update(candidates)
      .set({ deletedAt: timestamp() })
      .where(eq(candidates.id, candidate.id))
      .run();
  }

  deleteRound(roundId: string, confirmed: boolean): void {
    if (!confirmed) {
      throw new AppError(
        "DELETE_CONFIRMATION_REQUIRED",
        "Explicitly confirm round deletion.",
        409,
      );
    }
    const round = this.db
      .select()
      .from(generationRounds)
      .where(
        and(
          eq(generationRounds.id, roundId),
          isNull(generationRounds.deletedAt),
        ),
      )
      .get();
    if (!round)
      throw new AppError("ROUND_NOT_FOUND", "Generation round not found.", 404);
    const active = this.activeLockRow(round.creatureProjectId);
    if (active?.generationRoundId === round.id) {
      this.recordProtectedOperation(
        round.creatureProjectId,
        active.candidateId,
        round.id,
        "DELETE_LOCK_SOURCE_ROUND",
      );
      throw new AppError(
        "LOCK_SOURCE_ROUND_PROTECTED",
        "The source round of the authoritative locked design cannot be deleted.",
        409,
      );
    }
    const creature = this.creature(round.creatureProjectId);
    if (creature.currentRoundId === round.id) {
      throw new AppError(
        "CURRENT_ROUND_PROTECTED",
        "The current generation round cannot be deleted.",
        409,
      );
    }
    this.db
      .update(generationRounds)
      .set({ deletedAt: timestamp() })
      .where(eq(generationRounds.id, round.id))
      .run();
  }

  getHistory(creatureId: string): DesignHistoryView[] {
    const creature = this.creature(creatureId);
    const events = this.db
      .select()
      .from(historyEvents)
      .where(eq(historyEvents.creatureProjectId, creatureId))
      .orderBy(desc(historyEvents.createdAt))
      .all();
    return events.map((event) => {
      const candidate = event.candidateId
        ? this.db
            .select({
              id: candidates.id,
              candidateNumber: candidates.candidateNumber,
            })
            .from(candidates)
            .where(eq(candidates.id, event.candidateId))
            .get()
        : undefined;
      const round = event.generationRoundId
        ? this.db
            .select({
              id: generationRounds.id,
              roundNumber: generationRounds.roundNumber,
            })
            .from(generationRounds)
            .where(eq(generationRounds.id, event.generationRoundId))
            .get()
        : undefined;
      return {
        id: event.id,
        timestamp: event.createdAt,
        action: event.action,
        creature: { id: creature.id, displayName: creature.displayName },
        candidate: candidate ?? null,
        round: round ?? null,
        manifestVersion: event.manifestVersion,
        actor: event.actor,
        details: parseObject(event.payload),
      };
    });
  }

  getLockedDesignMedia(creatureId: string): { path: string; mimeType: string } {
    this.creature(creatureId);
    const active = this.activeLockRow(creatureId);
    const latest =
      active ??
      this.db
        .select()
        .from(designLocks)
        .where(eq(designLocks.creatureProjectId, creatureId))
        .orderBy(desc(designLocks.lockNumber))
        .get();
    if (!latest) {
      throw new AppError(
        "LOCKED_DESIGN_NOT_FOUND",
        "No locked design exists.",
        404,
      );
    }
    const path = fromRepositoryRelative(
      this.repositoryRoot,
      latest.activeReferencePath,
    );
    assertPathWithin(this.workspaceRoot, path);
    return { path, mimeType: "image/png" };
  }

  private candidateForProtectedOperation(candidateId: string): {
    id: string;
    roundId: string;
    creatureId: string;
    selected: boolean;
  } {
    const candidate = this.db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), isNull(candidates.deletedAt)))
      .get();
    if (!candidate)
      throw new AppError("CANDIDATE_NOT_FOUND", "Candidate not found.", 404);
    const round = this.db
      .select()
      .from(generationRounds)
      .where(eq(generationRounds.id, candidate.generationRoundId))
      .get();
    if (!round)
      throw new AppError("ROUND_NOT_FOUND", "Generation round not found.", 404);
    return {
      id: candidate.id,
      roundId: round.id,
      creatureId: round.creatureProjectId,
      selected: candidate.selected,
    };
  }

  private recordProtectedOperation(
    creatureId: string,
    candidateId: string,
    roundId: string,
    operation: string,
  ): void {
    const active = this.activeLockRow(creatureId);
    this.db
      .insert(historyEvents)
      .values({
        id: randomUUID(),
        creatureProjectId: creatureId,
        entityType: "DesignLock",
        entityId: active?.id ?? candidateId,
        action: "PROTECTED_OPERATION_REJECTED",
        payload: JSON.stringify({ operation }),
        candidateId,
        generationRoundId: roundId,
        manifestVersion: active?.manifestVersion ?? null,
        actor: "LOCAL_USER",
        createdAt: timestamp(),
      })
      .run();
  }

  private currentManifestPath(creature: CreatureRow): string {
    return resolveWithin(
      this.workspaceRoot,
      "creatures",
      creature.slug,
      "manifest.json",
    );
  }

  private manifestSnapshotPath(creature: CreatureRow, version: number): string {
    return resolveWithin(
      this.workspaceRoot,
      "creatures",
      creature.slug,
      "history",
      "manifests",
      `manifest-v${padVersion(version)}.json`,
    );
  }

  private async writeCurrentManifest(
    path: string,
    contents: string,
  ): Promise<void> {
    const backup = await this.replaceCurrentManifest(path, contents);
    if (backup) await rm(backup, { force: true });
  }

  private async replaceCurrentManifest(
    path: string,
    contents: string,
  ): Promise<string | null> {
    await mkdir(dirname(path), { recursive: true });
    const temporary = resolveWithin(
      dirname(path),
      `.${basename(path)}.${randomUUID()}.tmp`,
    );
    const backup = resolveWithin(
      dirname(path),
      `.${basename(path)}.${randomUUID()}.bak`,
    );
    await writeFile(temporary, contents, { encoding: "utf8", flag: "wx" });
    const hadCurrent = await exists(path);
    try {
      if (hadCurrent) await rename(path, backup);
      await rename(temporary, path);
      return hadCurrent ? backup : null;
    } catch (error) {
      await rm(temporary, { force: true });
      if (hadCurrent && (await exists(backup))) {
        await rename(backup, path).catch(() => undefined);
      }
      throw error;
    }
  }

  private async restoreCurrentManifest(
    path: string,
    backup: string | null,
  ): Promise<void> {
    if (backup) {
      await rm(path, { force: true });
      await rename(backup, path).catch(() => undefined);
    } else {
      await rm(path, { force: true });
    }
  }
}
