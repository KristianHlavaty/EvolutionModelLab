import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  animationFrames,
  animationPrompts,
  animations,
  creatureProjects,
  designLocks,
  designManifestVersions,
  historyEvents,
  type AppDatabase,
} from "@eml/database";
import {
  ImageInspectionError,
  inspectAnimationPng,
  normalizeOriginalFilename,
  perceptualHashDistance,
  type ImageLimits,
  type InspectedAnimationPng,
} from "@eml/image-processing";
import {
  buildAnimationIntermediatePrompt,
  buildAnimationKeyPosePrompt,
  buildAnimationRepairPrompt,
  type AnimationPromptInput,
} from "@eml/prompt-builder";
import {
  animationSettingsInputSchema,
  approveAnimationInputSchema,
  createAnimationInputSchema,
  repairPromptInputSchema,
  reorderAnimationFramesInputSchema,
  updateAnimationFrameInputSchema,
  type AnimationSettingsInput,
  type ApproveAnimationInput,
  type CreateAnimationInput,
  type FrameRole,
  type RepairPromptInput,
  type ReorderAnimationFramesInput,
  type UpdateAnimationFrameInput,
} from "@eml/shared";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { AppError } from "./errors.js";
import {
  assertPathWithin,
  fromRepositoryRelative,
  resolveWithin,
  toRepositoryRelative,
} from "./paths.js";
import type { ReferenceWorkflow } from "./references.js";

type AnimationRow = typeof animations.$inferSelect;
type FrameRow = typeof animationFrames.$inferSelect;
type PromptRow = typeof animationPrompts.$inferSelect;

export interface AnimationFileInput {
  buffer: Buffer;
  originalFilename: string;
}

export interface AnimationFrameView {
  id: string;
  animationId: string;
  frameNumber: number;
  frameRole: FrameRole;
  originalFilename: string;
  source: string;
  durationMs: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  fileHash: string;
  perceptualHash: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  center: { x: number; y: number };
  opaquePixelCount: number;
  touchesCanvasEdge: boolean;
  validationStatus: string;
  validationMessages: string[];
  markedForRepair: boolean;
  notes: string;
  replacesFrameId: string | null;
  imageUrl: string;
  thumbnailUrl: string;
  createdAt: string;
}

export interface AnimationPromptView {
  id: string;
  promptType: string;
  relatedFrameId: string | null;
  generatedPrompt: string;
  createdAt: string;
}

export interface AnimationView {
  id: string;
  creatureProjectId: string;
  designLockId: string;
  name: string;
  animationType: string;
  status: string;
  fps: number;
  looping: boolean;
  canvasWidth: number;
  canvasHeight: number;
  expectedFrameCount: number;
  currentDesign: boolean;
  lockedDesignUrl: string;
  anchor: { x: number; y: number };
  frames: AnimationFrameView[];
  prompts: AnimationPromptView[];
  createdAt: string;
  updatedAt: string;
}

function now(): string {
  return new Date().toISOString();
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

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export class AnimationWorkflow {
  constructor(
    private readonly db: AppDatabase,
    private readonly repositoryRoot: string,
    private readonly workspaceRoot: string,
    private readonly limits: ImageLimits,
    private readonly references: ReferenceWorkflow,
  ) {}

  private row(animationId: string): AnimationRow {
    const row = this.db
      .select()
      .from(animations)
      .where(and(eq(animations.id, animationId), isNull(animations.deletedAt)))
      .get();
    if (!row) {
      throw new AppError("ANIMATION_NOT_FOUND", "Animation not found.", 404);
    }
    return row;
  }

  private frameRow(frameId: string): FrameRow {
    const row = this.db
      .select()
      .from(animationFrames)
      .where(
        and(eq(animationFrames.id, frameId), isNull(animationFrames.deletedAt)),
      )
      .get();
    if (!row) {
      throw new AppError("FRAME_NOT_FOUND", "Animation frame not found.", 404);
    }
    return row;
  }

  private activeLock(creatureId: string) {
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

  private manifest(animation: AnimationRow): Record<string, unknown> {
    const lock = this.db
      .select()
      .from(designLocks)
      .where(eq(designLocks.id, animation.designLockId))
      .get();
    if (!lock) {
      throw new AppError(
        "DESIGN_LOCK_NOT_FOUND",
        "Design lock not found.",
        409,
      );
    }
    const version = this.db
      .select()
      .from(designManifestVersions)
      .where(eq(designManifestVersions.id, lock.manifestVersionId))
      .get();
    if (!version) {
      throw new AppError(
        "LOCKED_MANIFEST_MISSING",
        "Frozen manifest is missing.",
        409,
      );
    }
    return jsonObject(version.snapshot);
  }

  private animationPromptInput(animation: AnimationRow): AnimationPromptInput {
    const creature = this.db
      .select()
      .from(creatureProjects)
      .where(eq(creatureProjects.id, animation.creatureProjectId))
      .get();
    const lock = this.db
      .select()
      .from(designLocks)
      .where(eq(designLocks.id, animation.designLockId))
      .get();
    if (!creature || !lock) {
      throw new AppError(
        "ANIMATION_CONTEXT_MISSING",
        "Animation identity context is missing.",
        409,
      );
    }
    const manifest = this.manifest(animation);
    return {
      displayName: creature.displayName,
      animationName: animation.name,
      animationType: animation.animationType,
      lockedCandidateId: lock.candidateId,
      manifestVersion: lock.manifestVersion,
      immutableFeatures: stringList(manifest.immutableFeatures),
      forbiddenFeatures: stringList(manifest.forbiddenFeatures),
      animationNotes:
        typeof manifest.animationNotes === "string"
          ? manifest.animationNotes
          : "",
      frameCount: animation.expectedFrameCount,
      canvasWidth: animation.canvasWidth,
      canvasHeight: animation.canvasHeight,
      facing: typeof manifest.facing === "string" ? manifest.facing : "right",
      anchorX: typeof manifest.anchorX === "number" ? manifest.anchorX : 0,
      anchorY:
        typeof manifest.anchorY === "number"
          ? manifest.anchorY
          : animation.canvasHeight - 1,
    };
  }

  private frameView(row: FrameRow): AnimationFrameView {
    let messages: string[] = [];
    try {
      messages = stringList(JSON.parse(row.validationMessages));
    } catch {
      messages = [];
    }
    return {
      id: row.id,
      animationId: row.animationId,
      frameNumber: row.frameNumber,
      frameRole: row.frameRole as FrameRole,
      originalFilename: row.originalFilename,
      source: row.source,
      durationMs: row.durationMs,
      width: row.width,
      height: row.height,
      hasAlpha: row.hasAlpha,
      fileHash: row.fileHash,
      perceptualHash: row.perceptualHash,
      boundingBox: {
        x: row.boundingBoxX,
        y: row.boundingBoxY,
        width: row.boundingBoxWidth,
        height: row.boundingBoxHeight,
      },
      center: { x: row.centerX, y: row.centerY },
      opaquePixelCount: row.opaquePixelCount,
      touchesCanvasEdge: row.touchesCanvasEdge,
      validationStatus: row.validationStatus,
      validationMessages: messages,
      markedForRepair: row.markedForRepair,
      notes: row.notes,
      replacesFrameId: row.replacesFrameId,
      imageUrl: `/api/animation-frames/${row.id}/image`,
      thumbnailUrl: `/api/animation-frames/${row.id}/thumbnail`,
      createdAt: row.createdAt,
    };
  }

  private view(row: AnimationRow): AnimationView {
    const manifest = this.manifest(row);
    const frames = this.db
      .select()
      .from(animationFrames)
      .where(
        and(
          eq(animationFrames.animationId, row.id),
          isNull(animationFrames.deletedAt),
        ),
      )
      .orderBy(asc(animationFrames.frameNumber))
      .all();
    const prompts = this.db
      .select()
      .from(animationPrompts)
      .where(eq(animationPrompts.animationId, row.id))
      .orderBy(desc(animationPrompts.createdAt))
      .all();
    const currentLock = this.activeLock(row.creatureProjectId);
    return {
      id: row.id,
      creatureProjectId: row.creatureProjectId,
      designLockId: row.designLockId,
      name: row.name,
      animationType: row.animationType,
      status: row.status,
      fps: row.fps,
      looping: row.looping,
      canvasWidth: row.canvasWidth,
      canvasHeight: row.canvasHeight,
      expectedFrameCount: row.expectedFrameCount,
      currentDesign: currentLock?.id === row.designLockId,
      lockedDesignUrl: `/api/creatures/${row.creatureProjectId}/locked-design`,
      anchor: {
        x: typeof manifest.anchorX === "number" ? manifest.anchorX : 0,
        y:
          typeof manifest.anchorY === "number"
            ? manifest.anchorY
            : row.canvasHeight - 1,
      },
      frames: frames.map((frame) => this.frameView(frame)),
      prompts: prompts.map((prompt) => this.promptView(prompt)),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private promptView(row: PromptRow): AnimationPromptView {
    return {
      id: row.id,
      promptType: row.promptType,
      relatedFrameId: row.relatedFrameId,
      generatedPrompt: row.generatedPrompt,
      createdAt: row.createdAt,
    };
  }

  list(creatureId: string): AnimationView[] {
    this.references.getContext(creatureId);
    return this.db
      .select()
      .from(animations)
      .where(
        and(
          eq(animations.creatureProjectId, creatureId),
          isNull(animations.deletedAt),
        ),
      )
      .orderBy(desc(animations.updatedAt))
      .all()
      .map((row) => this.view(row));
  }

  get(animationId: string): AnimationView {
    return this.view(this.row(animationId));
  }

  async create(
    creatureId: string,
    input: CreateAnimationInput,
  ): Promise<AnimationView> {
    const parsed = createAnimationInputSchema.parse(input);
    const context = this.references.getContext(creatureId);
    if (!context.animationGateSatisfied || !context.activeLock) {
      throw new AppError(
        "ANIMATION_REFERENCES_INCOMPLETE",
        "Approve every mandatory reference for the current design before creating animations.",
        409,
        { missing: context.missingMandatoryReferenceTypes },
      );
    }
    const creature = this.db
      .select()
      .from(creatureProjects)
      .where(eq(creatureProjects.id, creatureId))
      .get();
    if (!creature)
      throw new AppError("CREATURE_NOT_FOUND", "Creature not found.", 404);
    const id = randomUUID();
    const stamp = now();
    const row: AnimationRow = {
      id,
      creatureProjectId: creatureId,
      designLockId: context.activeLock.id,
      name: parsed.name,
      animationType: parsed.animationType,
      status: "KEY_POSES",
      fps: parsed.fps,
      looping: parsed.looping,
      canvasWidth: parsed.canvasWidth,
      canvasHeight: parsed.canvasHeight,
      expectedFrameCount: parsed.expectedFrameCount,
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
    };
    const prompt = buildAnimationKeyPosePrompt(this.animationPromptInput(row));
    const promptId = randomUUID();
    const root = resolveWithin(
      this.workspaceRoot,
      "creatures",
      creature.slug,
      "animations",
      id,
    );
    const promptPath = resolveWithin(
      root,
      "prompts",
      `${promptId}-key-poses.md`,
    );
    const contextPath = resolveWithin(
      root,
      "prompts",
      `${promptId}-context.json`,
    );
    await mkdir(dirname(promptPath), { recursive: true });
    await writeFile(promptPath, prompt, { encoding: "utf8", flag: "wx" });
    await writeFile(
      contextPath,
      JSON.stringify(this.animationPromptInput(row), null, 2),
      {
        encoding: "utf8",
        flag: "wx",
      },
    );
    try {
      this.db.transaction((tx) => {
        tx.insert(animations).values(row).run();
        tx.insert(animationPrompts)
          .values({
            id: promptId,
            animationId: id,
            promptType: "KEY_POSES",
            relatedFrameId: null,
            generatedPrompt: prompt,
            promptPath: toRepositoryRelative(this.repositoryRoot, promptPath),
            contextPath: toRepositoryRelative(this.repositoryRoot, contextPath),
            actor: parsed.actor,
            createdAt: stamp,
          })
          .run();
        tx.update(creatureProjects)
          .set({ status: "ANIMATING", updatedAt: stamp })
          .where(eq(creatureProjects.id, creatureId))
          .run();
        tx.insert(historyEvents)
          .values({
            id: randomUUID(),
            creatureProjectId: creatureId,
            entityType: "ANIMATION",
            entityId: id,
            action: "ANIMATION_CREATED",
            payload: JSON.stringify({
              name: row.name,
              animationType: row.animationType,
            }),
            animationId: id,
            actor: parsed.actor,
            createdAt: stamp,
          })
          .run();
      });
    } catch (error) {
      await rm(root, { recursive: true, force: true });
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        throw new AppError(
          "ANIMATION_NAME_EXISTS",
          "An active animation already uses this name.",
          409,
        );
      }
      throw error;
    }
    return this.get(id);
  }

  updateSettings(
    animationId: string,
    input: AnimationSettingsInput,
  ): AnimationView {
    const parsed = animationSettingsInputSchema.parse(input);
    this.db
      .update(animations)
      .set({ fps: parsed.fps, looping: parsed.looping, updatedAt: now() })
      .where(eq(animations.id, this.row(animationId).id))
      .run();
    return this.get(animationId);
  }

  private validationMessages(
    animation: AnimationRow,
    inspected: InspectedAnimationPng,
    adjacent: FrameRow | undefined,
  ): string[] {
    const messages: string[] = [];
    if (
      inspected.width !== animation.canvasWidth ||
      inspected.height !== animation.canvasHeight
    ) {
      messages.push(
        `Canvas is ${inspected.width} Ă— ${inspected.height}; expected ${animation.canvasWidth} Ă— ${animation.canvasHeight}.`,
      );
    }
    if (!inspected.hasAlpha) messages.push("Frame has no alpha channel.");
    if (inspected.metrics.opaquePixelCount === 0)
      messages.push("Frame contains no visible pixels.");
    if (inspected.metrics.touchesCanvasEdge)
      messages.push("Visible pixels touch the canvas edge.");
    if (adjacent) {
      const centerDistance = Math.hypot(
        inspected.metrics.centerX - adjacent.centerX,
        inspected.metrics.centerY - adjacent.centerY,
      );
      if (centerDistance > Math.max(8, animation.canvasWidth * 0.1)) {
        messages.push("Center shifts sharply from the adjacent frame.");
      }
      const priorArea = Math.max(
        1,
        adjacent.boundingBoxWidth * adjacent.boundingBoxHeight,
      );
      const area =
        inspected.metrics.boundingBoxWidth *
        inspected.metrics.boundingBoxHeight;
      if (Math.abs(area - priorArea) / priorArea > 0.25) {
        messages.push(
          "Bounding-box area changes by more than 25% from the adjacent frame.",
        );
      }
      const priorOpaque = Math.max(1, adjacent.opaquePixelCount);
      if (
        Math.abs(inspected.metrics.opaquePixelCount - priorOpaque) /
          priorOpaque >
        0.25
      ) {
        messages.push(
          "Visible-pixel count changes by more than 25% from the adjacent frame.",
        );
      }
      if (
        perceptualHashDistance(
          inspected.metrics.perceptualHash,
          adjacent.perceptualHash,
        ) <= 4
      ) {
        messages.push(
          "Likely duplicate of the adjacent frame; review motion before approval.",
        );
      }
    }
    return messages;
  }

  async importFrames(
    animationId: string,
    files: AnimationFileInput[],
    frameRole: FrameRole,
    source: string,
    actor: string,
  ): Promise<AnimationView> {
    if (files.length < 1 || files.length > 120) {
      throw new AppError(
        "INVALID_FRAME_COUNT",
        "Import between 1 and 120 PNG frames.",
        400,
      );
    }
    const animation = this.row(animationId);
    const current = this.db
      .select()
      .from(animationFrames)
      .where(
        and(
          eq(animationFrames.animationId, animationId),
          isNull(animationFrames.deletedAt),
        ),
      )
      .orderBy(asc(animationFrames.frameNumber))
      .all();
    const inspected: InspectedAnimationPng[] = [];
    try {
      for (const file of files)
        inspected.push(await inspectAnimationPng(file.buffer, this.limits));
    } catch (error) {
      if (error instanceof ImageInspectionError) {
        throw new AppError(error.code, error.message, 400);
      }
      throw error;
    }
    const hashes = new Set(current.map((frame) => frame.fileHash));
    for (const image of inspected) {
      if (hashes.has(image.fileHash)) {
        throw new AppError(
          "DUPLICATE_FRAME",
          "An exact duplicate frame is already present in this animation.",
          409,
        );
      }
      hashes.add(image.fileHash);
    }
    const creature = this.db
      .select()
      .from(creatureProjects)
      .where(eq(creatureProjects.id, animation.creatureProjectId))
      .get();
    if (!creature)
      throw new AppError("CREATURE_NOT_FOUND", "Creature not found.", 404);
    const root = resolveWithin(
      this.workspaceRoot,
      "creatures",
      creature.slug,
      "animations",
      animationId,
    );
    const staged: Array<{
      row: typeof animationFrames.$inferInsert;
      image: string;
      thumbnail: string;
    }> = [];
    let adjacent = current.at(-1);
    for (const [index, file] of files.entries()) {
      const inspection = inspected[index]!;
      const id = randomUUID();
      const imagePath = resolveWithin(root, "frames", `${id}.png`);
      const thumbnailPath = resolveWithin(root, "thumbnails", `${id}.png`);
      const messages = this.validationMessages(animation, inspection, adjacent);
      const values: typeof animationFrames.$inferInsert = {
        id,
        animationId,
        frameNumber: current.length + index + 1,
        frameRole,
        imagePath: toRepositoryRelative(this.repositoryRoot, imagePath),
        thumbnailPath: toRepositoryRelative(this.repositoryRoot, thumbnailPath),
        source,
        originalFilename: normalizeOriginalFilename(file.originalFilename),
        durationMs: Math.max(1, Math.round(1000 / animation.fps)),
        width: inspection.width,
        height: inspection.height,
        hasAlpha: inspection.hasAlpha,
        fileHash: inspection.fileHash,
        perceptualHash: inspection.metrics.perceptualHash,
        boundingBoxX: inspection.metrics.boundingBoxX,
        boundingBoxY: inspection.metrics.boundingBoxY,
        boundingBoxWidth: inspection.metrics.boundingBoxWidth,
        boundingBoxHeight: inspection.metrics.boundingBoxHeight,
        centerX: inspection.metrics.centerX,
        centerY: inspection.metrics.centerY,
        opaquePixelCount: inspection.metrics.opaquePixelCount,
        touchesCanvasEdge: inspection.metrics.touchesCanvasEdge,
        validationStatus: messages.length > 0 ? "WARNING" : "VALID",
        validationMessages: JSON.stringify(messages),
        markedForRepair: false,
        notes: "",
        replacesFrameId: null,
        createdAt: now(),
        deletedAt: null,
      };
      await mkdir(dirname(imagePath), { recursive: true });
      await mkdir(dirname(thumbnailPath), { recursive: true });
      await writeFile(imagePath, file.buffer, { flag: "wx" });
      await writeFile(thumbnailPath, inspection.thumbnail, { flag: "wx" });
      staged.push({ row: values, image: imagePath, thumbnail: thumbnailPath });
      adjacent = values as FrameRow;
    }
    const stamp = now();
    try {
      this.db.transaction((tx) => {
        for (const item of staged)
          tx.insert(animationFrames).values(item.row).run();
        tx.update(animations)
          .set({ status: "REVIEW", updatedAt: stamp })
          .where(eq(animations.id, animationId))
          .run();
        tx.update(creatureProjects)
          .set({ status: "ANIMATION_REVIEW", updatedAt: stamp })
          .where(eq(creatureProjects.id, animation.creatureProjectId))
          .run();
        tx.insert(historyEvents)
          .values({
            id: randomUUID(),
            creatureProjectId: animation.creatureProjectId,
            entityType: "ANIMATION",
            entityId: animationId,
            action: "ANIMATION_FRAMES_IMPORTED",
            payload: JSON.stringify({ count: files.length, frameRole, source }),
            animationId,
            actor,
            createdAt: stamp,
          })
          .run();
      });
    } catch (error) {
      await Promise.all(
        staged.flatMap((item) => [
          rm(item.image, { force: true }),
          rm(item.thumbnail, { force: true }),
        ]),
      );
      throw error;
    }
    return this.get(animationId);
  }

  reorder(
    animationId: string,
    input: ReorderAnimationFramesInput,
  ): AnimationView {
    const parsed = reorderAnimationFramesInputSchema.parse(input);
    const animation = this.row(animationId);
    const active = this.db
      .select({ id: animationFrames.id })
      .from(animationFrames)
      .where(
        and(
          eq(animationFrames.animationId, animationId),
          isNull(animationFrames.deletedAt),
        ),
      )
      .all();
    if (
      active.length !== parsed.frameIds.length ||
      active.some((row) => !parsed.frameIds.includes(row.id))
    ) {
      throw new AppError(
        "INVALID_FRAME_ORDER",
        "The order must contain every active frame exactly once.",
        400,
      );
    }
    const stamp = now();
    this.db.transaction((tx) => {
      parsed.frameIds.forEach((id, index) =>
        tx
          .update(animationFrames)
          .set({ frameNumber: -(index + 1) })
          .where(eq(animationFrames.id, id))
          .run(),
      );
      parsed.frameIds.forEach((id, index) =>
        tx
          .update(animationFrames)
          .set({ frameNumber: index + 1 })
          .where(eq(animationFrames.id, id))
          .run(),
      );
      tx.update(animations)
        .set({ updatedAt: stamp })
        .where(eq(animations.id, animationId))
        .run();
      tx.insert(historyEvents)
        .values({
          id: randomUUID(),
          creatureProjectId: animation.creatureProjectId,
          entityType: "ANIMATION",
          entityId: animationId,
          action: "ANIMATION_FRAMES_REORDERED",
          payload: JSON.stringify({ frameIds: parsed.frameIds }),
          animationId,
          actor: parsed.actor,
          createdAt: stamp,
        })
        .run();
    });
    return this.get(animationId);
  }

  updateFrame(
    frameId: string,
    input: UpdateAnimationFrameInput,
  ): AnimationView {
    const parsed = updateAnimationFrameInputSchema.parse(input);
    const frame = this.frameRow(frameId);
    const animation = this.row(frame.animationId);
    const stamp = now();
    this.db.transaction((tx) => {
      tx.update(animationFrames)
        .set({
          frameRole: parsed.frameRole,
          durationMs: parsed.durationMs,
          notes: parsed.notes,
          markedForRepair: parsed.markedForRepair,
        })
        .where(eq(animationFrames.id, frameId))
        .run();
      tx.update(animations)
        .set({ status: "REVIEW", updatedAt: stamp })
        .where(eq(animations.id, animation.id))
        .run();
      tx.insert(historyEvents)
        .values({
          id: randomUUID(),
          creatureProjectId: animation.creatureProjectId,
          entityType: "ANIMATION_FRAME",
          entityId: frameId,
          action: "ANIMATION_FRAME_UPDATED",
          payload: JSON.stringify(parsed),
          animationId: animation.id,
          animationFrameId: frameId,
          actor: parsed.actor,
          createdAt: stamp,
        })
        .run();
    });
    return this.get(animation.id);
  }

  deleteFrame(
    frameId: string,
    confirmed: boolean,
    actor: string,
  ): AnimationView {
    if (!confirmed)
      throw new AppError(
        "CONFIRMATION_REQUIRED",
        "Confirm frame deletion.",
        400,
      );
    const frame = this.frameRow(frameId);
    const animation = this.row(frame.animationId);
    const remaining = this.db
      .select()
      .from(animationFrames)
      .where(
        and(
          eq(animationFrames.animationId, animation.id),
          isNull(animationFrames.deletedAt),
        ),
      )
      .orderBy(asc(animationFrames.frameNumber))
      .all()
      .filter((item) => item.id !== frameId);
    const stamp = now();
    this.db.transaction((tx) => {
      tx.update(animationFrames)
        .set({ deletedAt: stamp, frameNumber: -frame.frameNumber })
        .where(eq(animationFrames.id, frameId))
        .run();
      remaining.forEach((item, index) =>
        tx
          .update(animationFrames)
          .set({ frameNumber: index + 1 })
          .where(eq(animationFrames.id, item.id))
          .run(),
      );
      tx.update(animations)
        .set({ status: "REVIEW", updatedAt: stamp })
        .where(eq(animations.id, animation.id))
        .run();
      tx.insert(historyEvents)
        .values({
          id: randomUUID(),
          creatureProjectId: animation.creatureProjectId,
          entityType: "ANIMATION_FRAME",
          entityId: frameId,
          action: "ANIMATION_FRAME_REMOVED",
          payload: JSON.stringify({ preservedOriginal: true }),
          animationId: animation.id,
          animationFrameId: frameId,
          actor,
          createdAt: stamp,
        })
        .run();
    });
    return this.get(animation.id);
  }

  private async savePrompt(
    animation: AnimationRow,
    promptType: string,
    prompt: string,
    actor: string,
    relatedFrameId: string | null,
  ): Promise<AnimationView> {
    const creature = this.db
      .select()
      .from(creatureProjects)
      .where(eq(creatureProjects.id, animation.creatureProjectId))
      .get();
    if (!creature)
      throw new AppError("CREATURE_NOT_FOUND", "Creature not found.", 404);
    const id = randomUUID();
    const root = resolveWithin(
      this.workspaceRoot,
      "creatures",
      creature.slug,
      "animations",
      animation.id,
      "prompts",
    );
    const promptPath = resolveWithin(
      root,
      `${id}-${promptType.toLowerCase()}.md`,
    );
    const contextPath = resolveWithin(root, `${id}-context.json`);
    await mkdir(root, { recursive: true });
    await writeFile(promptPath, prompt, { encoding: "utf8", flag: "wx" });
    await writeFile(
      contextPath,
      JSON.stringify(this.animationPromptInput(animation), null, 2),
      { encoding: "utf8", flag: "wx" },
    );
    const stamp = now();
    try {
      this.db.transaction((tx) => {
        tx.insert(animationPrompts)
          .values({
            id,
            animationId: animation.id,
            promptType,
            relatedFrameId,
            generatedPrompt: prompt,
            promptPath: toRepositoryRelative(this.repositoryRoot, promptPath),
            contextPath: toRepositoryRelative(this.repositoryRoot, contextPath),
            actor,
            createdAt: stamp,
          })
          .run();
        tx.update(animations)
          .set({
            status: promptType === "INTERMEDIATES" ? "INTERMEDIATES" : "REVIEW",
            updatedAt: stamp,
          })
          .where(eq(animations.id, animation.id))
          .run();
      });
    } catch (error) {
      await Promise.all([
        rm(promptPath, { force: true }),
        rm(contextPath, { force: true }),
      ]);
      throw error;
    }
    return this.get(animation.id);
  }

  createIntermediatePrompt(
    animationId: string,
    actor: string,
  ): Promise<AnimationView> {
    const animation = this.row(animationId);
    const keyPoseCount =
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(animationFrames)
        .where(
          and(
            eq(animationFrames.animationId, animationId),
            eq(animationFrames.frameRole, "KEY_POSE"),
            isNull(animationFrames.deletedAt),
          ),
        )
        .get()?.count ?? 0;
    if (keyPoseCount < 2)
      throw new AppError(
        "KEY_POSES_REQUIRED",
        "Import at least two key poses first.",
        409,
      );
    return this.savePrompt(
      animation,
      "INTERMEDIATES",
      buildAnimationIntermediatePrompt(this.animationPromptInput(animation)),
      actor,
      null,
    );
  }

  createRepairPrompt(
    frameId: string,
    input: RepairPromptInput,
  ): Promise<AnimationView> {
    const parsed = repairPromptInputSchema.parse(input);
    const frame = this.frameRow(frameId);
    if (!frame.markedForRepair)
      throw new AppError(
        "FRAME_NOT_MARKED_FOR_REPAIR",
        "Mark this frame for repair first.",
        409,
      );
    const animation = this.row(frame.animationId);
    const prompt = buildAnimationRepairPrompt({
      ...this.animationPromptInput(animation),
      frameNumber: frame.frameNumber,
      brokenFrameId: frame.id,
      repairInstructions: parsed.repairInstructions,
    });
    return this.savePrompt(animation, "REPAIR", prompt, parsed.actor, frame.id);
  }

  async replaceFrame(
    frameId: string,
    file: AnimationFileInput,
    notes: string,
    actor: string,
  ): Promise<AnimationView> {
    const old = this.frameRow(frameId);
    const animation = this.row(old.animationId);
    let inspected: InspectedAnimationPng;
    try {
      inspected = await inspectAnimationPng(file.buffer, this.limits);
    } catch (error) {
      if (error instanceof ImageInspectionError)
        throw new AppError(error.code, error.message, 400);
      throw error;
    }
    const duplicate = this.db
      .select({ id: animationFrames.id })
      .from(animationFrames)
      .where(
        and(
          eq(animationFrames.animationId, animation.id),
          eq(animationFrames.fileHash, inspected.fileHash),
          isNull(animationFrames.deletedAt),
        ),
      )
      .get();
    if (duplicate)
      throw new AppError(
        "DUPLICATE_FRAME",
        "The replacement exactly duplicates an active frame.",
        409,
      );
    const creature = this.db
      .select()
      .from(creatureProjects)
      .where(eq(creatureProjects.id, animation.creatureProjectId))
      .get();
    if (!creature)
      throw new AppError("CREATURE_NOT_FOUND", "Creature not found.", 404);
    const id = randomUUID();
    const root = resolveWithin(
      this.workspaceRoot,
      "creatures",
      creature.slug,
      "animations",
      animation.id,
    );
    const imagePath = resolveWithin(root, "replaced-frames", `${id}.png`);
    const thumbnailPath = resolveWithin(root, "thumbnails", `${id}.png`);
    await mkdir(dirname(imagePath), { recursive: true });
    await mkdir(dirname(thumbnailPath), { recursive: true });
    await writeFile(imagePath, file.buffer, { flag: "wx" });
    await writeFile(thumbnailPath, inspected.thumbnail, { flag: "wx" });
    const messages = this.validationMessages(animation, inspected, undefined);
    const stamp = now();
    try {
      this.db.transaction((tx) => {
        tx.update(animationFrames)
          .set({ deletedAt: stamp, frameNumber: -old.frameNumber })
          .where(eq(animationFrames.id, old.id))
          .run();
        tx.insert(animationFrames)
          .values({
            id,
            animationId: animation.id,
            frameNumber: old.frameNumber,
            frameRole: "REPAIR",
            imagePath: toRepositoryRelative(this.repositoryRoot, imagePath),
            thumbnailPath: toRepositoryRelative(
              this.repositoryRoot,
              thumbnailPath,
            ),
            source: "MANUAL",
            originalFilename: normalizeOriginalFilename(file.originalFilename),
            durationMs: old.durationMs,
            width: inspected.width,
            height: inspected.height,
            hasAlpha: inspected.hasAlpha,
            fileHash: inspected.fileHash,
            perceptualHash: inspected.metrics.perceptualHash,
            boundingBoxX: inspected.metrics.boundingBoxX,
            boundingBoxY: inspected.metrics.boundingBoxY,
            boundingBoxWidth: inspected.metrics.boundingBoxWidth,
            boundingBoxHeight: inspected.metrics.boundingBoxHeight,
            centerX: inspected.metrics.centerX,
            centerY: inspected.metrics.centerY,
            opaquePixelCount: inspected.metrics.opaquePixelCount,
            touchesCanvasEdge: inspected.metrics.touchesCanvasEdge,
            validationStatus: messages.length ? "WARNING" : "VALID",
            validationMessages: JSON.stringify(messages),
            markedForRepair: false,
            notes,
            replacesFrameId: old.id,
            createdAt: stamp,
            deletedAt: null,
          })
          .run();
        tx.update(animations)
          .set({ status: "REVIEW", updatedAt: stamp })
          .where(eq(animations.id, animation.id))
          .run();
        tx.insert(historyEvents)
          .values({
            id: randomUUID(),
            creatureProjectId: animation.creatureProjectId,
            entityType: "ANIMATION_FRAME",
            entityId: id,
            action: "ANIMATION_FRAME_REPLACED",
            payload: JSON.stringify({
              replacedFrameId: old.id,
              preservedOriginal: true,
            }),
            animationId: animation.id,
            animationFrameId: id,
            actor,
            createdAt: stamp,
          })
          .run();
      });
    } catch (error) {
      await Promise.all([
        rm(imagePath, { force: true }),
        rm(thumbnailPath, { force: true }),
      ]);
      throw error;
    }
    return this.get(animation.id);
  }

  approve(animationId: string, input: ApproveAnimationInput): AnimationView {
    const parsed = approveAnimationInputSchema.parse(input);
    if (!parsed.confirmed)
      throw new AppError(
        "CONFIRMATION_REQUIRED",
        "Confirm animation approval.",
        400,
      );
    const animation = this.row(animationId);
    const context = this.references.getContext(animation.creatureProjectId);
    if (
      !context.animationGateSatisfied ||
      context.activeLock?.id !== animation.designLockId
    ) {
      throw new AppError(
        "ANIMATION_DESIGN_STALE",
        "Animation approval requires the current locked design and mandatory references.",
        409,
      );
    }
    const frames = this.db
      .select()
      .from(animationFrames)
      .where(
        and(
          eq(animationFrames.animationId, animationId),
          isNull(animationFrames.deletedAt),
        ),
      )
      .all();
    if (frames.length !== animation.expectedFrameCount) {
      throw new AppError(
        "FRAME_COUNT_MISMATCH",
        `Expected ${animation.expectedFrameCount} frames; found ${frames.length}.`,
        409,
      );
    }
    if (frames.some((frame) => frame.markedForRepair)) {
      throw new AppError(
        "REPAIRS_PENDING",
        "Resolve every frame marked for repair before approval.",
        409,
      );
    }
    const stamp = now();
    this.db.transaction((tx) => {
      tx.update(animations)
        .set({ status: "APPROVED", updatedAt: stamp })
        .where(eq(animations.id, animationId))
        .run();
      tx.update(creatureProjects)
        .set({ status: "ANIMATION_REVIEW", updatedAt: stamp })
        .where(eq(creatureProjects.id, animation.creatureProjectId))
        .run();
      tx.insert(historyEvents)
        .values({
          id: randomUUID(),
          creatureProjectId: animation.creatureProjectId,
          entityType: "ANIMATION",
          entityId: animationId,
          action: "ANIMATION_APPROVED",
          payload: JSON.stringify({ frameCount: frames.length }),
          animationId,
          actor: parsed.actor,
          createdAt: stamp,
        })
        .run();
    });
    return this.get(animationId);
  }

  getMedia(
    frameId: string,
    kind: "image" | "thumbnail",
  ): { path: string; mimeType: string } {
    const frame = this.frameRow(frameId);
    const stored = kind === "image" ? frame.imagePath : frame.thumbnailPath;
    const path = fromRepositoryRelative(this.repositoryRoot, stored);
    assertPathWithin(this.workspaceRoot, path);
    return { path, mimeType: "image/png" };
  }
}
