import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const creatureProjects = sqliteTable(
  "creature_projects",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    scientificName: text("scientific_name"),
    description: text("description").notNull().default(""),
    generationBrief: text("generation_brief").notNull(),
    status: text("status").notNull().default("DRAFT"),
    parentCreatureId: text("parent_creature_id"),
    evolutionaryGeneration: integer("evolutionary_generation"),
    currentRoundId: text("current_round_id"),
    lockedCandidateId: text("locked_candidate_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("creature_projects_slug_unique").on(table.slug),
    index("creature_projects_status_idx").on(table.status),
  ],
);

export const generationRounds = sqliteTable(
  "generation_rounds",
  {
    id: text("id").primaryKey(),
    creatureProjectId: text("creature_project_id")
      .notNull()
      .references(() => creatureProjects.id, { onDelete: "restrict" }),
    roundNumber: integer("round_number").notNull(),
    roundType: text("round_type").notNull(),
    parentCandidateId: text("parent_candidate_id"),
    sourceCreatureId: text("source_creature_id"),
    generatedPrompt: text("generated_prompt").notNull(),
    positiveFeedback: text("positive_feedback"),
    defectsToCorrect: text("defects_to_correct"),
    requestedChanges: text("requested_changes"),
    forbiddenChanges: text("forbidden_changes"),
    feedbackSnapshot: text("feedback_snapshot"),
    createdAt: text("created_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("generation_rounds_creature_number_unique")
      .on(table.creatureProjectId, table.roundNumber)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const candidates = sqliteTable(
  "candidates",
  {
    id: text("id").primaryKey(),
    generationRoundId: text("generation_round_id")
      .notNull()
      .references(() => generationRounds.id, { onDelete: "restrict" }),
    candidateNumber: integer("candidate_number").notNull(),
    imagePath: text("image_path").notNull(),
    thumbnailPath: text("thumbnail_path").notNull(),
    source: text("source").notNull(),
    originalFilename: text("original_filename").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    hasAlpha: integer("has_alpha", { mode: "boolean" }).notNull(),
    fileHash: text("file_hash").notNull(),
    perceptualHash: text("perceptual_hash"),
    mimeType: text("mime_type").notNull(),
    notes: text("notes"),
    rating: integer("rating"),
    rejected: integer("rejected", { mode: "boolean" }).notNull().default(false),
    selected: integer("selected", { mode: "boolean" }).notNull().default(false),
    contactSheetImportId: text("contact_sheet_import_id"),
    cropX: integer("crop_x"),
    cropY: integer("crop_y"),
    cropWidth: integer("crop_width"),
    cropHeight: integer("crop_height"),
    createdAt: text("created_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("candidates_round_number_unique")
      .on(table.generationRoundId, table.candidateNumber)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("candidates_round_hash_unique")
      .on(table.generationRoundId, table.fileHash)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("candidates_one_selected_per_round")
      .on(table.generationRoundId)
      .where(sql`${table.selected} = 1 AND ${table.deletedAt} IS NULL`),
  ],
);

export const contactSheetImports = sqliteTable(
  "contact_sheet_imports",
  {
    id: text("id").primaryKey(),
    generationRoundId: text("generation_round_id")
      .notNull()
      .references(() => generationRounds.id, { onDelete: "restrict" }),
    originalPath: text("original_path").notNull(),
    originalFilename: text("original_filename").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    fileHash: text("file_hash").notNull(),
    rows: integer("rows").notNull(),
    columns: integer("columns").notNull(),
    marginTop: integer("margin_top").notNull(),
    marginRight: integer("margin_right").notNull(),
    marginBottom: integer("margin_bottom").notNull(),
    marginLeft: integer("margin_left").notNull(),
    horizontalGap: integer("horizontal_gap").notNull(),
    verticalGap: integer("vertical_gap").notNull(),
    cropRectangles: text("crop_rectangles").notNull(),
    status: text("status").notNull().default("PREVIEW"),
    createdAt: text("created_at").notNull(),
    confirmedAt: text("confirmed_at"),
  },
  (table) => [
    index("contact_sheet_imports_round_idx").on(table.generationRoundId),
    uniqueIndex("contact_sheet_imports_round_hash_unique").on(
      table.generationRoundId,
      table.fileHash,
    ),
  ],
);

export const candidateFeedback = sqliteTable(
  "candidate_feedback",
  {
    id: text("id").primaryKey(),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "restrict" }),
    preserveTraits: text("preserve_traits").notNull().default("[]"),
    anatomyToPreserve: text("anatomy_to_preserve").notNull().default("[]"),
    paletteToPreserve: text("palette_to_preserve").notNull().default("[]"),
    silhouetteToPreserve: text("silhouette_to_preserve")
      .notNull()
      .default("[]"),
    defects: text("defects").notNull().default("[]"),
    requestedChanges: text("requested_changes").notNull().default("[]"),
    forbiddenChanges: text("forbidden_changes").notNull().default("[]"),
    generalNotes: text("general_notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("candidate_feedback_candidate_unique").on(table.candidateId),
  ],
);

export const historyEvents = sqliteTable(
  "history_events",
  {
    id: text("id").primaryKey(),
    creatureProjectId: text("creature_project_id"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    payload: text("payload").notNull(),
    candidateId: text("candidate_id"),
    generationRoundId: text("generation_round_id"),
    manifestVersion: integer("manifest_version"),
    actor: text("actor"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("history_events_created_idx").on(table.createdAt)],
);

export const designManifests = sqliteTable(
  "design_manifests",
  {
    id: text("id").primaryKey(),
    creatureProjectId: text("creature_project_id")
      .notNull()
      .references(() => creatureProjects.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(0),
    immutableFeatures: text("immutable_features").notNull().default("[]"),
    preferredFeatures: text("preferred_features").notNull().default("[]"),
    forbiddenFeatures: text("forbidden_features").notNull().default("[]"),
    anatomyNotes: text("anatomy_notes").notNull().default(""),
    biologicalNotes: text("biological_notes").notNull().default(""),
    styleNotes: text("style_notes").notNull().default(""),
    paletteNotes: text("palette_notes").notNull().default(""),
    textureNotes: text("texture_notes").notNull().default(""),
    cameraNotes: text("camera_notes").notNull().default(""),
    lightingNotes: text("lighting_notes").notNull().default(""),
    animationNotes: text("animation_notes").notNull().default(""),
    canvasWidth: integer("canvas_width").notNull().default(1024),
    canvasHeight: integer("canvas_height").notNull().default(1024),
    facing: text("facing").notNull().default("right"),
    anchorX: integer("anchor_x").notNull().default(512),
    anchorY: integer("anchor_y").notNull().default(1023),
    transparentBackgroundRequired: integer("transparent_background_required", {
      mode: "boolean",
    })
      .notNull()
      .default(true),
    explicitFields: text("explicit_fields").notNull().default("[]"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("design_manifests_creature_unique").on(table.creatureProjectId),
  ],
);

export const designManifestVersions = sqliteTable(
  "design_manifest_versions",
  {
    id: text("id").primaryKey(),
    designManifestId: text("design_manifest_id")
      .notNull()
      .references(() => designManifests.id, { onDelete: "restrict" }),
    creatureProjectId: text("creature_project_id")
      .notNull()
      .references(() => creatureProjects.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    snapshot: text("snapshot").notNull(),
    snapshotPath: text("snapshot_path").notNull(),
    reason: text("reason").notNull(),
    actor: text("actor"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("design_manifest_versions_manifest_version_unique").on(
      table.designManifestId,
      table.version,
    ),
    uniqueIndex("design_manifest_versions_snapshot_path_unique").on(
      table.snapshotPath,
    ),
  ],
);

export const designLocks = sqliteTable(
  "design_locks",
  {
    id: text("id").primaryKey(),
    creatureProjectId: text("creature_project_id")
      .notNull()
      .references(() => creatureProjects.id, { onDelete: "restrict" }),
    lockNumber: integer("lock_number").notNull(),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "restrict" }),
    generationRoundId: text("generation_round_id")
      .notNull()
      .references(() => generationRounds.id, { onDelete: "restrict" }),
    manifestVersionId: text("manifest_version_id")
      .notNull()
      .references(() => designManifestVersions.id, { onDelete: "restrict" }),
    manifestVersion: integer("manifest_version").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    activeReferencePath: text("active_reference_path").notNull(),
    archivedReferencePath: text("archived_reference_path"),
    sourceFileHash: text("source_file_hash").notNull(),
    actor: text("actor"),
    lockedAt: text("locked_at").notNull(),
    unlockedAt: text("unlocked_at"),
  },
  (table) => [
    uniqueIndex("design_locks_creature_number_unique").on(
      table.creatureProjectId,
      table.lockNumber,
    ),
    uniqueIndex("design_locks_one_active_per_creature")
      .on(table.creatureProjectId)
      .where(sql`${table.status} = 'ACTIVE'`),
    index("design_locks_candidate_idx").on(table.candidateId),
  ],
);

export const projectSettings = sqliteTable("project_settings", {
  id: text("id").primaryKey(),
  workspaceRoot: text("workspace_root").notNull(),
  exportsRoot: text("exports_root").notNull(),
  defaultCanvasWidth: integer("default_canvas_width").notNull().default(1024),
  defaultCanvasHeight: integer("default_canvas_height").notNull().default(1024),
  defaultFacing: text("default_facing").notNull().default("right"),
  defaultCandidateCount: integer("default_candidate_count")
    .notNull()
    .default(10),
  defaultAnimationFps: integer("default_animation_fps").notNull().default(12),
  requireTransparency: integer("require_transparency", { mode: "boolean" })
    .notNull()
    .default(true),
  maximumUploadBytes: integer("maximum_upload_bytes")
    .notNull()
    .default(10_485_760),
  maximumImageWidth: integer("maximum_image_width").notNull().default(4096),
  maximumImageHeight: integer("maximum_image_height").notNull().default(4096),
  requiredReferenceTypes: text("required_reference_types")
    .notNull()
    .default('["LOCKED_DESIGN","SIDE_PROFILE","SILHOUETTE","COLOUR_MATERIAL"]'),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
