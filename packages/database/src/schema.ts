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
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("history_events_created_idx").on(table.createdAt)],
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
