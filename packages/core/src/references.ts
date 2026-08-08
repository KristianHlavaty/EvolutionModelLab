import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  creatureProjects,
  designLocks,
  designManifestVersions,
  historyEvents,
  projectSettings,
  referenceImages,
  type AppDatabase,
} from "@eml/database";
import {
  ImageInspectionError,
  inspectPng,
  normalizeOriginalFilename,
  type ImageLimits,
} from "@eml/image-processing";
import { buildReferencePrompt } from "@eml/prompt-builder";
import {
  approveReferenceInputSchema,
  createReferenceInputSchema,
  projectReferenceSettingsInputSchema,
  referenceTypes,
  requestableReferenceTypes,
  type ApproveReferenceInput,
  type CreateReferenceInput,
  type ProjectReferenceSettingsInput,
  type ReferenceType,
} from "@eml/shared";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { AppError } from "./errors.js";
import {
  assertPathWithin,
  fromRepositoryRelative,
  resolveWithin,
  toRepositoryRelative,
} from "./paths.js";

type CreatureRow = typeof creatureProjects.$inferSelect;
type LockRow = typeof designLocks.$inferSelect;
type ReferenceRow = typeof referenceImages.$inferSelect;

const referenceLabels: Record<ReferenceType, string> = {
  LOCKED_DESIGN: "locked design",
  SIDE_PROFILE: "strict side profile",
  OPPOSITE_SIDE: "opposite side profile",
  FRONT: "front view",
  THREE_QUARTER: "three-quarter view",
  TOP: "top view",
  SILHOUETTE: "silhouette reference",
  COLOUR_MATERIAL: "colour and material reference",
  ANATOMY_DIAGRAM: "anatomy notes diagram",
};

export interface ReferenceValidationView {
  valid: boolean;
  warnings: string[];
  checks: {
    decodedPng: boolean;
    withinUploadLimits: boolean;
    transparentBackground: boolean;
    canvasMatchesManifest: boolean;
    currentDesignLock: boolean;
  };
}

export interface ReferenceImageView {
  id: string;
  creatureProjectId: string;
  designLockId: string;
  referenceType: ReferenceType;
  referenceLabel: string;
  status: string;
  generatedPrompt: string;
  originalFilename: string | null;
  notes: string;
  validation: ReferenceValidationView;
  width: number | null;
  height: number | null;
  hasAlpha: boolean | null;
  fileHash: string | null;
  approved: boolean;
  currentDesign: boolean;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  actor: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

export interface ReferenceContextView {
  creature: {
    id: string;
    displayName: string;
    scientificName: string | null;
    status: string;
  };
  activeLock: {
    id: string;
    candidateId: string;
    manifestVersion: number;
    imageUrl: string;
  } | null;
  requiredReferenceTypes: ReferenceType[];
  satisfiedReferenceTypes: ReferenceType[];
  missingMandatoryReferenceTypes: ReferenceType[];
  availableReferenceTypes: Array<{
    type: Exclude<ReferenceType, "LOCKED_DESIGN">;
    label: string;
    mandatory: boolean;
    approved: boolean;
    latestStatus: string | null;
  }>;
  references: ReferenceImageView[];
  canRequest: boolean;
  animationGateSatisfied: boolean;
}

export interface ProjectReferenceSettingsView {
  requiredReferenceTypes: ReferenceType[];
  availableReferenceTypes: Array<{
    type: ReferenceType;
    label: string;
  }>;
  updatedAt: string;
}

export interface ReferenceFileInput {
  buffer: Buffer;
  originalFilename: string;
}

function timestamp(): string {
  return new Date().toISOString();
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function requiredTypes(value: string): ReferenceType[] {
  try {
    const parsed: unknown = JSON.parse(value);
    const values = Array.isArray(parsed)
      ? parsed.filter(
          (item): item is ReferenceType =>
            typeof item === "string" &&
            referenceTypes.includes(item as ReferenceType),
        )
      : [];
    return values.length > 0 ? [...new Set(values)] : ["LOCKED_DESIGN"];
  } catch {
    return ["LOCKED_DESIGN"];
  }
}

function referenceFolder(referenceType: ReferenceType): string {
  return referenceType.toLowerCase().replaceAll("_", "-");
}

function exists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}

function defaultValidation(): ReferenceValidationView {
  return {
    valid: false,
    warnings: [],
    checks: {
      decodedPng: false,
      withinUploadLimits: false,
      transparentBackground: false,
      canvasMatchesManifest: false,
      currentDesignLock: false,
    },
  };
}

function parseValidation(value: string): ReferenceValidationView {
  const parsed = parseJsonObject(value);
  const checks =
    parsed.checks && typeof parsed.checks === "object"
      ? (parsed.checks as Record<string, unknown>)
      : {};
  return {
    valid: parsed.valid === true,
    warnings: stringList(parsed.warnings),
    checks: {
      decodedPng: checks.decodedPng === true,
      withinUploadLimits: checks.withinUploadLimits === true,
      transparentBackground: checks.transparentBackground === true,
      canvasMatchesManifest: checks.canvasMatchesManifest === true,
      currentDesignLock: checks.currentDesignLock === true,
    },
  };
}

export class ReferenceWorkflow {
  constructor(
    private readonly db: AppDatabase,
    private readonly repositoryRoot: string,
    private readonly workspaceRoot: string,
    private readonly limits: ImageLimits,
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
    if (!creature) {
      throw new AppError("CREATURE_NOT_FOUND", "Creature not found.", 404);
    }
    return creature;
  }

  private activeLock(creatureId: string): LockRow | null {
    return (
      this.db
        .select()
        .from(designLocks)
        .where(
          and(
            eq(designLocks.creatureProjectId, creatureId),
            eq(designLocks.status, "ACTIVE"),
          ),
        )
        .get() ?? null
    );
  }

  private settingsRow() {
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
    return settings;
  }

  private row(referenceId: string): ReferenceRow {
    const row = this.db
      .select()
      .from(referenceImages)
      .where(eq(referenceImages.id, referenceId))
      .get();
    if (!row) {
      throw new AppError(
        "REFERENCE_NOT_FOUND",
        "Canonical reference request not found.",
        404,
      );
    }
    return row;
  }

  private view(
    row: ReferenceRow,
    activeLockId: string | null,
  ): ReferenceImageView {
    return {
      id: row.id,
      creatureProjectId: row.creatureProjectId,
      designLockId: row.designLockId,
      referenceType: row.referenceType as ReferenceType,
      referenceLabel:
        referenceLabels[row.referenceType as ReferenceType] ??
        row.referenceType,
      status: row.status,
      generatedPrompt: row.generatedPrompt,
      originalFilename: row.originalFilename,
      notes: row.notes,
      validation: parseValidation(row.validation),
      width: row.width,
      height: row.height,
      hasAlpha: row.hasAlpha,
      fileHash: row.fileHash,
      approved: row.approved,
      currentDesign: row.designLockId === activeLockId,
      imageUrl: row.imagePath ? `/api/references/${row.id}/image` : null,
      thumbnailUrl: row.thumbnailPath
        ? `/api/references/${row.id}/thumbnail`
        : null,
      actor: row.actor,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      approvedAt: row.approvedAt,
    };
  }

  private frozenManifest(lock: LockRow): Record<string, unknown> {
    const version = this.db
      .select()
      .from(designManifestVersions)
      .where(eq(designManifestVersions.id, lock.manifestVersionId))
      .get();
    if (!version) {
      throw new AppError(
        "LOCKED_MANIFEST_MISSING",
        "The frozen manifest for the active design lock is missing.",
        409,
      );
    }
    return parseJsonObject(version.snapshot);
  }

  private async verifyLock(lock: LockRow): Promise<void> {
    const path = fromRepositoryRelative(
      this.repositoryRoot,
      lock.activeReferencePath,
    );
    assertPathWithin(this.workspaceRoot, path);
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch {
      throw new AppError(
        "LOCKED_REFERENCE_MISSING",
        "The active locked-design reference is missing.",
        409,
      );
    }
    try {
      const inspected = await inspectPng(bytes, this.limits);
      if (inspected.fileHash !== lock.sourceFileHash) {
        throw new AppError(
          "LOCKED_REFERENCE_MISMATCH",
          "The active locked-design bytes no longer match the design lock.",
          409,
        );
      }
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      if (cause instanceof ImageInspectionError) {
        throw new AppError(
          "LOCKED_REFERENCE_INVALID",
          `The active locked-design reference is invalid: ${cause.message}`,
          409,
        );
      }
      throw cause;
    }
  }

  private satisfaction(creatureId: string, lock: LockRow | null) {
    const required = requiredTypes(this.settingsRow().requiredReferenceTypes);
    const satisfiedSet = new Set<ReferenceType>();
    if (lock) satisfiedSet.add("LOCKED_DESIGN");
    if (lock) {
      const approved = this.db
        .select({ referenceType: referenceImages.referenceType })
        .from(referenceImages)
        .where(
          and(
            eq(referenceImages.creatureProjectId, creatureId),
            eq(referenceImages.designLockId, lock.id),
            eq(referenceImages.approved, true),
          ),
        )
        .all();
      for (const row of approved) {
        const referenceType = row.referenceType as ReferenceType;
        satisfiedSet.add(referenceType);
      }
    }
    const satisfied = referenceTypes.filter((referenceType) =>
      satisfiedSet.has(referenceType),
    );
    return {
      required,
      satisfied,
      missing: required.filter((item) => !satisfied.includes(item)),
    };
  }

  private reconcileStatus(creatureId: string, lock?: LockRow | null): string {
    const creature = this.creature(creatureId);
    const currentLock = lock === undefined ? this.activeLock(creatureId) : lock;
    if (!currentLock) return creature.status;
    const { missing } = this.satisfaction(creatureId, currentLock);
    const status =
      missing.length === 0 ? "REFERENCE_APPROVED" : "REFERENCE_BUILDING";
    if (
      creature.status === "DESIGN_LOCKED" ||
      creature.status === "REFERENCE_BUILDING" ||
      creature.status === "REFERENCE_APPROVED"
    ) {
      this.db
        .update(creatureProjects)
        .set({ status, updatedAt: timestamp() })
        .where(eq(creatureProjects.id, creatureId))
        .run();
      return status;
    }
    return creature.status;
  }

  getContext(creatureId: string): ReferenceContextView {
    const creature = this.creature(creatureId);
    const lock = this.activeLock(creatureId);
    const { required, satisfied, missing } = this.satisfaction(
      creatureId,
      lock,
    );
    const rows = this.db
      .select()
      .from(referenceImages)
      .where(eq(referenceImages.creatureProjectId, creatureId))
      .orderBy(desc(referenceImages.createdAt), desc(referenceImages.id))
      .all();
    const current = rows.filter((row) => row.designLockId === lock?.id);
    return {
      creature: {
        id: creature.id,
        displayName: creature.displayName,
        scientificName: creature.scientificName,
        status: creature.status,
      },
      activeLock: lock
        ? {
            id: lock.id,
            candidateId: lock.candidateId,
            manifestVersion: lock.manifestVersion,
            imageUrl: `/api/creatures/${creatureId}/locked-design`,
          }
        : null,
      requiredReferenceTypes: required,
      satisfiedReferenceTypes: satisfied,
      missingMandatoryReferenceTypes: missing,
      availableReferenceTypes: requestableReferenceTypes.map(
        (referenceType) => {
          const latest = current.find(
            (row) => row.referenceType === referenceType,
          );
          return {
            type: referenceType,
            label: referenceLabels[referenceType],
            mandatory: required.includes(referenceType),
            approved: current.some(
              (row) => row.referenceType === referenceType && row.approved,
            ),
            latestStatus: latest?.status ?? null,
          };
        },
      ),
      references: rows.map((row) => this.view(row, lock?.id ?? null)),
      canRequest: Boolean(lock),
      animationGateSatisfied: Boolean(lock) && missing.length === 0,
    };
  }

  async createReference(
    creatureId: string,
    input: CreateReferenceInput,
  ): Promise<ReferenceImageView> {
    const parsed = createReferenceInputSchema.parse(input);
    const creature = this.creature(creatureId);
    const lock = this.activeLock(creatureId);
    if (!lock || creature.lockedCandidateId !== lock.candidateId) {
      throw new AppError(
        "DESIGN_LOCK_REQUIRED",
        "Lock one authoritative creature design before requesting references.",
        409,
      );
    }
    await this.verifyLock(lock);
    const existing = this.db
      .select()
      .from(referenceImages)
      .where(
        and(
          eq(referenceImages.designLockId, lock.id),
          eq(referenceImages.referenceType, parsed.referenceType),
        ),
      )
      .orderBy(desc(referenceImages.createdAt))
      .all();
    if (existing.some((item) => item.approved)) {
      throw new AppError(
        "REFERENCE_ALREADY_APPROVED",
        "This reference type is already approved for the active design lock.",
        409,
      );
    }
    if (existing.some((item) => item.status === "REQUESTED")) {
      throw new AppError(
        "REFERENCE_REQUEST_PENDING",
        "Import the existing requested reference before creating another attempt.",
        409,
      );
    }

    const manifest = this.frozenManifest(lock);
    const prompt = buildReferencePrompt({
      displayName: creature.displayName,
      scientificName: creature.scientificName,
      referenceType: parsed.referenceType,
      referenceLabel: referenceLabels[parsed.referenceType],
      lockedCandidateId: lock.candidateId,
      manifestVersion: lock.manifestVersion,
      immutableFeatures: stringList(manifest.immutableFeatures),
      preferredFeatures: stringList(manifest.preferredFeatures),
      forbiddenFeatures: stringList(manifest.forbiddenFeatures),
      anatomyNotes:
        typeof manifest.anatomyNotes === "string" ? manifest.anatomyNotes : "",
      paletteNotes:
        typeof manifest.paletteNotes === "string" ? manifest.paletteNotes : "",
      textureNotes:
        typeof manifest.textureNotes === "string" ? manifest.textureNotes : "",
      constraints: {
        camera:
          typeof manifest.cameraNotes === "string" && manifest.cameraNotes
            ? manifest.cameraNotes
            : `canonical ${referenceLabels[parsed.referenceType]}`,
        facing: typeof manifest.facing === "string" ? manifest.facing : "right",
        canvasWidth:
          typeof manifest.canvasWidth === "number"
            ? manifest.canvasWidth
            : 1024,
        canvasHeight:
          typeof manifest.canvasHeight === "number"
            ? manifest.canvasHeight
            : 1024,
        transparency: manifest.transparentBackgroundRequired !== false,
        lighting:
          typeof manifest.lightingNotes === "string" && manifest.lightingNotes
            ? manifest.lightingNotes
            : "neutral studio lighting matching the locked design",
        style:
          typeof manifest.styleNotes === "string" && manifest.styleNotes
            ? manifest.styleNotes
            : "match the attached locked design exactly",
      },
    });
    const id = randomUUID();
    const createdAt = timestamp();
    const root = resolveWithin(
      this.workspaceRoot,
      "creatures",
      creature.slug,
      "references",
      referenceFolder(parsed.referenceType),
      id,
    );
    if (await exists(root)) {
      throw new AppError(
        "REFERENCE_PATH_COLLISION",
        "The new reference workspace already exists; nothing was overwritten.",
        409,
      );
    }
    const promptPath = resolveWithin(root, "prompt.txt");
    const contextPath = resolveWithin(root, "generation-context.json");
    const promptRelative = toRepositoryRelative(
      this.repositoryRoot,
      promptPath,
    );
    const contextRelative = toRepositoryRelative(
      this.repositoryRoot,
      contextPath,
    );
    try {
      await mkdir(root, { recursive: true });
      await writeFile(promptPath, prompt, { encoding: "utf8", flag: "wx" });
      await writeFile(
        contextPath,
        `${JSON.stringify(
          {
            taskType: "REFERENCE",
            creatureId,
            referenceId: id,
            referenceType: parsed.referenceType,
            designLockId: lock.id,
            lockedCandidateId: lock.candidateId,
            manifestVersion: lock.manifestVersion,
            lockedReferencePath: lock.activeReferencePath,
            createdAt,
          },
          null,
          2,
        )}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      this.db.transaction((tx) => {
        tx.insert(referenceImages)
          .values({
            id,
            creatureProjectId: creatureId,
            designLockId: lock.id,
            referenceType: parsed.referenceType,
            status: "REQUESTED",
            generatedPrompt: prompt,
            promptPath: promptRelative,
            contextPath: contextRelative,
            notes: parsed.notes,
            validation: JSON.stringify(defaultValidation()),
            actor: parsed.actor,
            createdAt,
            updatedAt: createdAt,
          })
          .run();
        tx.insert(historyEvents)
          .values({
            id: randomUUID(),
            creatureProjectId: creatureId,
            entityType: "REFERENCE_IMAGE",
            entityId: id,
            action: "REFERENCE_REQUEST_CREATED",
            payload: JSON.stringify({
              referenceType: parsed.referenceType,
              designLockId: lock.id,
              promptPath: promptRelative,
            }),
            candidateId: lock.candidateId,
            manifestVersion: lock.manifestVersion,
            referenceImageId: id,
            actor: parsed.actor,
            createdAt,
          })
          .run();
      });
    } catch (cause) {
      await rm(root, { recursive: true, force: true });
      throw cause;
    }
    this.reconcileStatus(creatureId, lock);
    return this.view(this.row(id), lock.id);
  }

  async importReference(
    referenceId: string,
    file: ReferenceFileInput,
    notes: string,
    actor: string,
  ): Promise<ReferenceImageView> {
    const row = this.row(referenceId);
    if (row.status !== "REQUESTED" || row.imagePath) {
      throw new AppError(
        "REFERENCE_IMPORT_NOT_ALLOWED",
        "This reference attempt already has an imported image.",
        409,
      );
    }
    const lock = this.activeLock(row.creatureProjectId);
    if (!lock || lock.id !== row.designLockId) {
      throw new AppError(
        "REFERENCE_DESIGN_STALE",
        "This request belongs to an older design lock and cannot accept an import.",
        409,
      );
    }
    let inspected: Awaited<ReturnType<typeof inspectPng>>;
    try {
      inspected = await inspectPng(file.buffer, this.limits);
    } catch (cause) {
      if (cause instanceof ImageInspectionError) {
        throw new AppError(cause.code, cause.message, 400);
      }
      throw cause;
    }
    const duplicate = this.db
      .select({ id: referenceImages.id })
      .from(referenceImages)
      .where(
        and(
          eq(referenceImages.creatureProjectId, row.creatureProjectId),
          eq(referenceImages.designLockId, row.designLockId),
          eq(referenceImages.fileHash, inspected.fileHash),
        ),
      )
      .get();
    if (duplicate) {
      throw new AppError(
        "DUPLICATE_REFERENCE",
        "These exact PNG bytes are already stored for this design lock.",
        409,
      );
    }
    const manifest = this.frozenManifest(lock);
    const expectedWidth =
      typeof manifest.canvasWidth === "number" ? manifest.canvasWidth : 1024;
    const expectedHeight =
      typeof manifest.canvasHeight === "number" ? manifest.canvasHeight : 1024;
    const transparencyRequired =
      manifest.transparentBackgroundRequired !== false;
    const warnings: string[] = [];
    if (transparencyRequired && !inspected.hasAlpha) {
      warnings.push("The frozen manifest requires a transparent background.");
    }
    if (
      inspected.width !== expectedWidth ||
      inspected.height !== expectedHeight
    ) {
      warnings.push(
        `Image dimensions are ${inspected.width}×${inspected.height}; the frozen manifest canvas is ${expectedWidth}×${expectedHeight}.`,
      );
    }
    const validation: ReferenceValidationView = {
      valid: true,
      warnings,
      checks: {
        decodedPng: true,
        withinUploadLimits: true,
        transparentBackground: !transparencyRequired || inspected.hasAlpha,
        canvasMatchesManifest:
          inspected.width === expectedWidth &&
          inspected.height === expectedHeight,
        currentDesignLock: true,
      },
    };
    const promptPath = fromRepositoryRelative(
      this.repositoryRoot,
      row.promptPath,
    );
    assertPathWithin(this.workspaceRoot, promptPath);
    const root = dirname(promptPath);
    assertPathWithin(this.workspaceRoot, root);
    const originalPath = resolveWithin(root, `${randomUUID()}-original.png`);
    const thumbnailPath = resolveWithin(root, `${randomUUID()}-thumbnail.png`);
    const originalRelative = toRepositoryRelative(
      this.repositoryRoot,
      originalPath,
    );
    const thumbnailRelative = toRepositoryRelative(
      this.repositoryRoot,
      thumbnailPath,
    );
    let originalWritten = false;
    let thumbnailWritten = false;
    let committed = false;
    try {
      await writeFile(originalPath, file.buffer, { flag: "wx" });
      originalWritten = true;
      await writeFile(thumbnailPath, inspected.thumbnail, { flag: "wx" });
      thumbnailWritten = true;
      const updatedAt = timestamp();
      this.db.transaction((tx) => {
        tx.update(referenceImages)
          .set({
            status: "IMPORTED",
            imagePath: originalRelative,
            thumbnailPath: thumbnailRelative,
            originalFilename: normalizeOriginalFilename(file.originalFilename),
            notes,
            validation: JSON.stringify(validation),
            width: inspected.width,
            height: inspected.height,
            hasAlpha: inspected.hasAlpha,
            fileHash: inspected.fileHash,
            mimeType: inspected.mimeType,
            actor,
            updatedAt,
          })
          .where(eq(referenceImages.id, referenceId))
          .run();
        tx.insert(historyEvents)
          .values({
            id: randomUUID(),
            creatureProjectId: row.creatureProjectId,
            entityType: "REFERENCE_IMAGE",
            entityId: referenceId,
            action: "REFERENCE_IMPORTED",
            payload: JSON.stringify({
              referenceType: row.referenceType,
              imagePath: originalRelative,
              fileHash: inspected.fileHash,
              validation,
            }),
            candidateId: lock.candidateId,
            manifestVersion: lock.manifestVersion,
            referenceImageId: referenceId,
            actor,
            createdAt: updatedAt,
          })
          .run();
      });
      committed = true;
    } catch (cause) {
      if (!committed) {
        if (thumbnailWritten) await rm(thumbnailPath, { force: true });
        if (originalWritten) await rm(originalPath, { force: true });
      }
      throw cause;
    }
    return this.view(this.row(referenceId), lock.id);
  }

  async approveReference(
    referenceId: string,
    input: ApproveReferenceInput,
  ): Promise<ReferenceImageView> {
    const parsed = approveReferenceInputSchema.parse(input);
    if (!parsed.confirmed) {
      throw new AppError(
        "REFERENCE_APPROVAL_CONFIRMATION_REQUIRED",
        "Confirm that this image matches the locked design before approval.",
        409,
      );
    }
    const row = this.row(referenceId);
    if (row.approved || row.status === "APPROVED") {
      throw new AppError(
        "REFERENCE_ALREADY_APPROVED",
        "This canonical reference is already approved.",
        409,
      );
    }
    if (
      row.status !== "IMPORTED" ||
      !row.imagePath ||
      !row.fileHash ||
      !parseValidation(row.validation).valid
    ) {
      throw new AppError(
        "REFERENCE_IMPORT_REQUIRED",
        "Import and validate one PNG before approving this reference.",
        409,
      );
    }
    const lock = this.activeLock(row.creatureProjectId);
    if (!lock || lock.id !== row.designLockId) {
      throw new AppError(
        "REFERENCE_DESIGN_STALE",
        "This reference belongs to an older design lock and cannot be approved.",
        409,
      );
    }
    const imagePath = fromRepositoryRelative(
      this.repositoryRoot,
      row.imagePath,
    );
    assertPathWithin(this.workspaceRoot, imagePath);
    let inspection: Awaited<ReturnType<typeof inspectPng>>;
    try {
      inspection = await inspectPng(await readFile(imagePath), this.limits);
    } catch (cause) {
      if (cause instanceof ImageInspectionError) {
        throw new AppError(
          "REFERENCE_FILE_INVALID",
          `The stored reference PNG is invalid: ${cause.message}`,
          409,
        );
      }
      throw new AppError(
        "REFERENCE_FILE_MISSING",
        "The stored reference PNG is missing.",
        409,
      );
    }
    if (inspection.fileHash !== row.fileHash) {
      throw new AppError(
        "REFERENCE_FILE_MISMATCH",
        "The stored reference bytes no longer match the import record.",
        409,
      );
    }
    const approvedAt = timestamp();
    this.db.transaction((tx) => {
      tx.update(referenceImages)
        .set({
          status: "APPROVED",
          approved: true,
          notes: parsed.notes ?? row.notes,
          actor: parsed.actor,
          updatedAt: approvedAt,
          approvedAt,
        })
        .where(eq(referenceImages.id, referenceId))
        .run();
      tx.insert(historyEvents)
        .values({
          id: randomUUID(),
          creatureProjectId: row.creatureProjectId,
          entityType: "REFERENCE_IMAGE",
          entityId: referenceId,
          action: "REFERENCE_APPROVED",
          payload: JSON.stringify({
            referenceType: row.referenceType,
            designLockId: lock.id,
            fileHash: row.fileHash,
          }),
          candidateId: lock.candidateId,
          manifestVersion: lock.manifestVersion,
          referenceImageId: referenceId,
          actor: parsed.actor,
          createdAt: approvedAt,
        })
        .run();
    });
    this.reconcileStatus(row.creatureProjectId, lock);
    return this.view(this.row(referenceId), lock.id);
  }

  getMedia(referenceId: string, kind: "image" | "thumbnail") {
    const row = this.row(referenceId);
    const relative = kind === "image" ? row.imagePath : row.thumbnailPath;
    if (!relative || !row.mimeType) {
      throw new AppError(
        "REFERENCE_MEDIA_NOT_FOUND",
        "Reference media is not available yet.",
        404,
      );
    }
    const path = fromRepositoryRelative(this.repositoryRoot, relative);
    assertPathWithin(this.workspaceRoot, path);
    return { path, mimeType: row.mimeType };
  }

  getSettings(): ProjectReferenceSettingsView {
    const settings = this.settingsRow();
    return {
      requiredReferenceTypes: requiredTypes(settings.requiredReferenceTypes),
      availableReferenceTypes: referenceTypes.map((referenceType) => ({
        type: referenceType,
        label: referenceLabels[referenceType],
      })),
      updatedAt: settings.updatedAt,
    };
  }

  updateSettings(
    input: ProjectReferenceSettingsInput,
  ): ProjectReferenceSettingsView {
    const parsed = projectReferenceSettingsInputSchema.parse(input);
    const updatedAt = timestamp();
    this.db.transaction((tx) => {
      tx.update(projectSettings)
        .set({
          requiredReferenceTypes: JSON.stringify(parsed.requiredReferenceTypes),
          updatedAt,
        })
        .where(eq(projectSettings.id, "default"))
        .run();
      tx.insert(historyEvents)
        .values({
          id: randomUUID(),
          creatureProjectId: null,
          entityType: "PROJECT_SETTINGS",
          entityId: "default",
          action: "MANDATORY_REFERENCE_RULES_UPDATED",
          payload: JSON.stringify({
            requiredReferenceTypes: parsed.requiredReferenceTypes,
          }),
          actor: parsed.actor,
          createdAt: updatedAt,
        })
        .run();
    });
    const lockedCreatureIds = this.db
      .select({ creatureProjectId: designLocks.creatureProjectId })
      .from(designLocks)
      .where(eq(designLocks.status, "ACTIVE"))
      .orderBy(asc(designLocks.creatureProjectId))
      .all()
      .map((row) => row.creatureProjectId);
    if (lockedCreatureIds.length > 0) {
      const creatures = this.db
        .select({ id: creatureProjects.id })
        .from(creatureProjects)
        .where(inArray(creatureProjects.id, lockedCreatureIds))
        .all();
      for (const creature of creatures) this.reconcileStatus(creature.id);
    }
    return this.getSettings();
  }
}
