import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";

import {
  animationFrames,
  animationPrompts,
  animations,
  creatureProjects,
  designLocks,
  designManifestVersions,
  evolutionMutations,
  exportRuns,
  generationRounds,
  historyEvents,
  referenceImages,
  type AppDatabase,
} from "@eml/database";
import { GenericSpriteExporter } from "@eml/sprite-exporter";
import {
  exportCreatureInputSchema,
  type ExportCreatureInput,
} from "@eml/shared";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { AnimationWorkflow } from "./animation.js";
import { AppError } from "./errors.js";
import {
  assertPathWithin,
  fromRepositoryRelative,
  resolveWithin,
  toRepositoryRelative,
} from "./paths.js";
import type { ReferenceWorkflow } from "./references.js";

export interface ValidationAnimationView {
  id: string;
  name: string;
  animationType: string;
  status: string;
  currentDesign: boolean;
  expectedFrameCount: number;
  activeFrameCount: number;
  warningFrameCount: number;
  pendingRepairCount: number;
  messages: Array<{
    frameId: string;
    frameNumber: number;
    messages: string[];
  }>;
}

export interface ValidationReportView {
  creatureId: string;
  creatureName: string;
  generatedAt: string;
  currentDesignLockId: string | null;
  missingMandatoryReferences: string[];
  referencesApproved: number;
  animations: ValidationAnimationView[];
  approvedAnimationCount: number;
  warningCount: number;
  blockingIssues: string[];
  readyForExport: boolean;
}

export interface ExportSummary {
  exportId: string;
  version: number;
  format: string;
  creatureId: string;
  creatureName: string;
  createdAt: string;
  packagePath: string;
  animationCount: number;
  referenceCount: number;
  frameCount: number;
  warningCount: number;
  includePromptHistory: boolean;
  files: string[];
}

export interface ExportRunView {
  id: string;
  creatureProjectId: string;
  designLockId: string;
  version: number;
  exportFormat: string;
  status: string;
  packagePath: string;
  includePromptHistory: boolean;
  actor: string | null;
  createdAt: string;
  summary: ExportSummary;
}

function timestamp(): string {
  return new Date().toISOString();
}

function stringList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function jsonObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function exists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}

export class ExportWorkflow {
  private readonly spriteExporter = new GenericSpriteExporter();

  constructor(
    private readonly db: AppDatabase,
    private readonly repositoryRoot: string,
    private readonly workspaceRoot: string,
    private readonly exportsRoot: string,
    private readonly references: ReferenceWorkflow,
    private readonly animation: AnimationWorkflow,
  ) {}

  getValidationReport(
    creatureId: string,
    animationId?: string,
  ): ValidationReportView {
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
    const referenceContext = this.references.getContext(creatureId);
    const allAnimations = this.animation.list(creatureId);
    if (
      animationId &&
      !allAnimations.some((animation) => animation.id === animationId)
    ) {
      throw new AppError(
        "ANIMATION_NOT_FOUND",
        "Animation not found for this creature.",
        404,
      );
    }
    const selected = animationId
      ? allAnimations.filter((item) => item.id === animationId)
      : allAnimations;
    const animationsReport = selected.map((item) => ({
      id: item.id,
      name: item.name,
      animationType: item.animationType,
      status: item.status,
      currentDesign: item.currentDesign,
      expectedFrameCount: item.expectedFrameCount,
      activeFrameCount: item.frames.length,
      warningFrameCount: item.frames.filter(
        (frame) => frame.validationStatus !== "VALID",
      ).length,
      pendingRepairCount: item.frames.filter((frame) => frame.markedForRepair)
        .length,
      messages: item.frames
        .filter((frame) => frame.validationMessages.length > 0)
        .map((frame) => ({
          frameId: frame.id,
          frameNumber: frame.frameNumber,
          messages: frame.validationMessages,
        })),
    }));
    const approved = allAnimations.filter(
      (item) =>
        item.currentDesign &&
        (item.status === "APPROVED" || item.status === "EXPORTED"),
    );
    const blockingIssues: string[] = [];
    if (!referenceContext.activeLock) {
      blockingIssues.push("An active design lock is required.");
    }
    if (referenceContext.missingMandatoryReferenceTypes.length > 0) {
      blockingIssues.push(
        `Missing mandatory references: ${referenceContext.missingMandatoryReferenceTypes.join(", ")}.`,
      );
    }
    if (approved.length === 0) {
      blockingIssues.push(
        "At least one animation for the current design must be approved.",
      );
    }
    const warningCount = animationsReport.reduce(
      (count, item) =>
        count +
        item.messages.reduce(
          (animationCount, frame) => animationCount + frame.messages.length,
          0,
        ),
      0,
    );
    return {
      creatureId,
      creatureName: creature.displayName,
      generatedAt: timestamp(),
      currentDesignLockId: referenceContext.activeLock?.id ?? null,
      missingMandatoryReferences:
        referenceContext.missingMandatoryReferenceTypes,
      referencesApproved: referenceContext.references.filter(
        (reference) => reference.currentDesign && reference.approved,
      ).length,
      animations: animationsReport,
      approvedAnimationCount: approved.length,
      warningCount,
      blockingIssues,
      readyForExport: blockingIssues.length === 0,
    };
  }

  list(creatureId: string): ExportRunView[] {
    this.references.getContext(creatureId);
    return this.db
      .select()
      .from(exportRuns)
      .where(eq(exportRuns.creatureProjectId, creatureId))
      .orderBy(desc(exportRuns.version))
      .all()
      .map((row) => ({
        id: row.id,
        creatureProjectId: row.creatureProjectId,
        designLockId: row.designLockId,
        version: row.version,
        exportFormat: row.exportFormat,
        status: row.status,
        packagePath: row.exportPath,
        includePromptHistory: row.includePromptHistory,
        actor: row.actor,
        createdAt: row.createdAt,
        summary: jsonObject(row.summary) as unknown as ExportSummary,
      }));
  }

  async create(
    creatureId: string,
    input: ExportCreatureInput,
  ): Promise<ExportRunView> {
    const parsed = exportCreatureInputSchema.parse(input);
    if (!parsed.confirmed) {
      throw new AppError(
        "CONFIRMATION_REQUIRED",
        "Confirm creation of a new versioned export package.",
        400,
      );
    }
    const report = this.getValidationReport(creatureId);
    if (!report.readyForExport || !report.currentDesignLockId) {
      throw new AppError(
        "EXPORT_NOT_READY",
        "The creature has unresolved export gates.",
        409,
        { blockingIssues: report.blockingIssues },
      );
    }
    const creature = this.db
      .select()
      .from(creatureProjects)
      .where(eq(creatureProjects.id, creatureId))
      .get();
    const lock = this.db
      .select()
      .from(designLocks)
      .where(eq(designLocks.id, report.currentDesignLockId))
      .get();
    if (!creature || !lock) {
      throw new AppError(
        "EXPORT_CONTEXT_MISSING",
        "The export identity context is missing.",
        409,
      );
    }
    const manifestVersion = this.db
      .select()
      .from(designManifestVersions)
      .where(eq(designManifestVersions.id, lock.manifestVersionId))
      .get();
    if (!manifestVersion) {
      throw new AppError(
        "LOCKED_MANIFEST_MISSING",
        "The frozen manifest is missing.",
        409,
      );
    }
    const approvedAnimations = this.db
      .select()
      .from(animations)
      .where(
        and(
          eq(animations.creatureProjectId, creatureId),
          eq(animations.designLockId, lock.id),
          inArray(animations.status, ["APPROVED", "EXPORTED"]),
          isNull(animations.deletedAt),
        ),
      )
      .orderBy(asc(animations.createdAt))
      .all();
    const approvedReferences = this.db
      .select()
      .from(referenceImages)
      .where(
        and(
          eq(referenceImages.creatureProjectId, creatureId),
          eq(referenceImages.designLockId, lock.id),
          eq(referenceImages.approved, true),
        ),
      )
      .orderBy(asc(referenceImages.referenceType))
      .all();
    const version =
      (this.db
        .select({
          maximum: sql<number>`coalesce(max(${exportRuns.version}), 0)`,
        })
        .from(exportRuns)
        .where(eq(exportRuns.creatureProjectId, creatureId))
        .get()?.maximum ?? 0) + 1;
    const id = randomUUID();
    const stamp = timestamp();
    const creatureRoot = resolveWithin(this.exportsRoot, creature.slug);
    const destination = resolveWithin(
      creatureRoot,
      `export-v${String(version).padStart(3, "0")}`,
    );
    const staging = resolveWithin(creatureRoot, `.staging-${id}`);
    await mkdir(creatureRoot, { recursive: true });
    if (await exists(destination)) {
      throw new AppError(
        "EXPORT_PATH_EXISTS",
        "The next versioned export path already exists and will not be overwritten.",
        409,
      );
    }
    await mkdir(staging, { recursive: false });
    const files: string[] = [];
    const writeJson = async (relative: string, value: unknown) => {
      const path = resolveWithin(staging, ...relative.split("/"));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(value, null, 2), {
        encoding: "utf8",
        flag: "wx",
      });
      files.push(relative);
    };
    const copyOriginal = async (storedPath: string, relative: string) => {
      const source = fromRepositoryRelative(this.repositoryRoot, storedPath);
      assertPathWithin(this.workspaceRoot, source);
      const target = resolveWithin(staging, ...relative.split("/"));
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target, constants.COPYFILE_EXCL);
      files.push(relative);
    };
    let frameCount = 0;
    try {
      await copyOriginal(lock.activeReferencePath, "locked-design.png");
      for (const reference of approvedReferences) {
        if (!reference.imagePath) continue;
        await copyOriginal(
          reference.imagePath,
          `references/${reference.referenceType.toLowerCase().replaceAll("_", "-")}.png`,
        );
      }
      const animationSummaries: Array<Record<string, unknown>> = [];
      for (const animation of approvedAnimations) {
        const frames = this.db
          .select()
          .from(animationFrames)
          .where(
            and(
              eq(animationFrames.animationId, animation.id),
              isNull(animationFrames.deletedAt),
            ),
          )
          .orderBy(asc(animationFrames.frameNumber))
          .all();
        frameCount += frames.length;
        const folder = `animations/${animation.animationType.toLowerCase()}-${animation.id.slice(0, 8)}`;
        const spriteInput = [];
        for (const frame of frames) {
          const relative = `${folder}/frames/frame-${String(frame.frameNumber).padStart(4, "0")}.png`;
          await copyOriginal(frame.imagePath, relative);
          const path = fromRepositoryRelative(
            this.repositoryRoot,
            frame.imagePath,
          );
          assertPathWithin(this.workspaceRoot, path);
          spriteInput.push({
            id: frame.id,
            frameNumber: frame.frameNumber,
            durationMs: frame.durationMs,
            buffer: await readFile(path),
          });
        }
        let sprite;
        try {
          sprite = await this.spriteExporter.createSpriteSheet({
            frames: spriteInput,
            canvasWidth: animation.canvasWidth,
            canvasHeight: animation.canvasHeight,
          });
        } catch (cause) {
          throw new AppError(
            "SPRITE_SHEET_FAILED",
            cause instanceof Error
              ? cause.message
              : "Sprite-sheet generation failed.",
            409,
          );
        }
        const spritePath = resolveWithin(
          staging,
          ...`${folder}/sprite-sheet.png`.split("/"),
        );
        await mkdir(dirname(spritePath), { recursive: true });
        await writeFile(spritePath, sprite.png, { flag: "wx" });
        files.push(`${folder}/sprite-sheet.png`);
        const animationJson = {
          id: animation.id,
          name: animation.name,
          animationType: animation.animationType,
          fps: animation.fps,
          looping: animation.looping,
          canvas: {
            width: animation.canvasWidth,
            height: animation.canvasHeight,
          },
          anchor: this.animation.get(animation.id).anchor,
          spriteSheet: {
            path: "sprite-sheet.png",
            width: sprite.width,
            height: sprite.height,
            columns: sprite.columns,
            rows: sprite.rows,
          },
          validationStatus: frames.some(
            (frame) => frame.validationStatus !== "VALID",
          )
            ? "WARNING"
            : "VALID",
          frames: frames.map((frame, index) => ({
            id: frame.id,
            number: frame.frameNumber,
            role: frame.frameRole,
            path: `frames/frame-${String(frame.frameNumber).padStart(4, "0")}.png`,
            durationMs: frame.durationMs,
            rectangle: sprite.frames[index],
            validationStatus: frame.validationStatus,
            validationMessages: stringList(frame.validationMessages),
          })),
        };
        await writeJson(`${folder}/animation.json`, animationJson);
        animationSummaries.push({
          id: animation.id,
          name: animation.name,
          animationType: animation.animationType,
          folder,
          frameCount: frames.length,
        });
      }
      await writeJson("creature-manifest.json", {
        creature: {
          id: creature.id,
          slug: creature.slug,
          displayName: creature.displayName,
          scientificName: creature.scientificName,
          description: creature.description,
          generationBrief: creature.generationBrief,
          evolutionaryGeneration: creature.evolutionaryGeneration,
        },
        designLock: {
          id: lock.id,
          candidateId: lock.candidateId,
          manifestVersion: lock.manifestVersion,
          lockedAt: lock.lockedAt,
        },
        manifest: jsonObject(manifestVersion.snapshot),
        references: approvedReferences.map((reference) => ({
          id: reference.id,
          referenceType: reference.referenceType,
          path: `references/${reference.referenceType.toLowerCase().replaceAll("_", "-")}.png`,
        })),
        animations: animationSummaries,
      });
      const mutations = this.db
        .select()
        .from(evolutionMutations)
        .where(eq(evolutionMutations.childCreatureId, creatureId))
        .orderBy(asc(evolutionMutations.sortOrder))
        .all();
      await writeJson("evolution.json", {
        creatureId,
        parentCreatureId: creature.parentCreatureId,
        evolutionaryGeneration: creature.evolutionaryGeneration,
        mutations: mutations.map((mutation) => ({
          category: mutation.category,
          description: mutation.description,
          order: mutation.sortOrder,
          intensity: mutation.intensity,
          inherited: mutation.inherited,
        })),
      });
      if (parsed.includePromptHistory) {
        const rounds = this.db
          .select()
          .from(generationRounds)
          .where(eq(generationRounds.creatureProjectId, creatureId))
          .orderBy(asc(generationRounds.roundNumber))
          .all();
        const referencePrompts = approvedReferences.map((reference) => ({
          type: "REFERENCE",
          id: reference.id,
          subtype: reference.referenceType,
          prompt: reference.generatedPrompt,
          createdAt: reference.createdAt,
        }));
        const animationIds = approvedAnimations.map((item) => item.id);
        const prompts =
          animationIds.length > 0
            ? this.db
                .select()
                .from(animationPrompts)
                .where(inArray(animationPrompts.animationId, animationIds))
                .orderBy(asc(animationPrompts.createdAt))
                .all()
            : [];
        await writeJson("prompt-history.json", [
          ...rounds.map((round) => ({
            type: "GENERATION_ROUND",
            id: round.id,
            subtype: round.roundType,
            roundNumber: round.roundNumber,
            prompt: round.generatedPrompt,
            createdAt: round.createdAt,
          })),
          ...referencePrompts,
          ...prompts.map((prompt) => ({
            type: "ANIMATION",
            id: prompt.id,
            animationId: prompt.animationId,
            subtype: prompt.promptType,
            prompt: prompt.generatedPrompt,
            createdAt: prompt.createdAt,
          })),
        ]);
      }
      await writeJson("validation-report.json", report);
      const packagePath = toRepositoryRelative(
        this.repositoryRoot,
        destination,
      );
      const summary: ExportSummary = {
        exportId: id,
        version,
        format: parsed.exportFormat,
        creatureId,
        creatureName: creature.displayName,
        createdAt: stamp,
        packagePath,
        animationCount: approvedAnimations.length,
        referenceCount: approvedReferences.length,
        frameCount,
        warningCount: report.warningCount,
        includePromptHistory: parsed.includePromptHistory,
        files: [...files, "export-summary.json"].sort(),
      };
      await writeJson("export-summary.json", summary);
      await rename(staging, destination);
      try {
        this.db.transaction((tx) => {
          tx.insert(exportRuns)
            .values({
              id,
              creatureProjectId: creatureId,
              designLockId: lock.id,
              version,
              exportFormat: parsed.exportFormat,
              status: "COMPLETE",
              exportPath: packagePath,
              summaryPath: `${packagePath}/export-summary.json`,
              summary: JSON.stringify(summary),
              includePromptHistory: parsed.includePromptHistory,
              actor: parsed.actor,
              createdAt: stamp,
            })
            .run();
          tx.update(animations)
            .set({ status: "EXPORTED", updatedAt: stamp })
            .where(
              inArray(
                animations.id,
                approvedAnimations.map((item) => item.id),
              ),
            )
            .run();
          tx.update(creatureProjects)
            .set({ status: "GAME_READY", updatedAt: stamp })
            .where(eq(creatureProjects.id, creatureId))
            .run();
          tx.insert(historyEvents)
            .values({
              id: randomUUID(),
              creatureProjectId: creatureId,
              entityType: "EXPORT_RUN",
              entityId: id,
              action: "CREATURE_EXPORTED",
              payload: JSON.stringify(summary),
              exportRunId: id,
              actor: parsed.actor,
              createdAt: stamp,
            })
            .run();
        });
      } catch (error) {
        await rm(destination, { recursive: true, force: true });
        throw error;
      }
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
    return this.list(creatureId).find((item) => item.id === id)!;
  }
}
