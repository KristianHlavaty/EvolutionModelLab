CREATE TABLE `creature_projects` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `display_name` text NOT NULL,
  `scientific_name` text,
  `description` text NOT NULL DEFAULT '',
  `generation_brief` text NOT NULL,
  `status` text NOT NULL DEFAULT 'DRAFT',
  `parent_creature_id` text,
  `evolutionary_generation` integer,
  `current_round_id` text,
  `locked_candidate_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creature_projects_slug_unique` ON `creature_projects` (`slug`);
--> statement-breakpoint
CREATE INDEX `creature_projects_status_idx` ON `creature_projects` (`status`);
--> statement-breakpoint
CREATE TABLE `generation_rounds` (
  `id` text PRIMARY KEY NOT NULL,
  `creature_project_id` text NOT NULL,
  `round_number` integer NOT NULL,
  `round_type` text NOT NULL,
  `parent_candidate_id` text,
  `source_creature_id` text,
  `generated_prompt` text NOT NULL,
  `positive_feedback` text,
  `defects_to_correct` text,
  `requested_changes` text,
  `forbidden_changes` text,
  `created_at` text NOT NULL,
  `deleted_at` text,
  FOREIGN KEY (`creature_project_id`) REFERENCES `creature_projects` (`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_rounds_creature_number_unique` ON `generation_rounds` (`creature_project_id`,`round_number`) WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE TABLE `candidates` (
  `id` text PRIMARY KEY NOT NULL,
  `generation_round_id` text NOT NULL,
  `candidate_number` integer NOT NULL,
  `image_path` text NOT NULL,
  `thumbnail_path` text NOT NULL,
  `source` text NOT NULL,
  `original_filename` text NOT NULL,
  `width` integer NOT NULL,
  `height` integer NOT NULL,
  `has_alpha` integer NOT NULL,
  `file_hash` text NOT NULL,
  `perceptual_hash` text,
  `mime_type` text NOT NULL,
  `notes` text,
  `rating` integer,
  `rejected` integer NOT NULL DEFAULT 0,
  `selected` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  `deleted_at` text,
  FOREIGN KEY (`generation_round_id`) REFERENCES `generation_rounds` (`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidates_round_number_unique` ON `candidates` (`generation_round_id`,`candidate_number`) WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `candidates_round_hash_unique` ON `candidates` (`generation_round_id`,`file_hash`) WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `candidates_one_selected_per_round` ON `candidates` (`generation_round_id`) WHERE `selected` = 1 AND `deleted_at` IS NULL;
--> statement-breakpoint
CREATE TABLE `candidate_feedback` (
  `id` text PRIMARY KEY NOT NULL,
  `candidate_id` text NOT NULL,
  `preserve_traits` text NOT NULL DEFAULT '[]',
  `anatomy_to_preserve` text NOT NULL DEFAULT '[]',
  `palette_to_preserve` text NOT NULL DEFAULT '[]',
  `silhouette_to_preserve` text NOT NULL DEFAULT '[]',
  `defects` text NOT NULL DEFAULT '[]',
  `requested_changes` text NOT NULL DEFAULT '[]',
  `forbidden_changes` text NOT NULL DEFAULT '[]',
  `general_notes` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_feedback_candidate_unique` ON `candidate_feedback` (`candidate_id`);
--> statement-breakpoint
CREATE TABLE `history_events` (
  `id` text PRIMARY KEY NOT NULL,
  `creature_project_id` text,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `action` text NOT NULL,
  `payload` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `history_events_created_idx` ON `history_events` (`created_at`);
--> statement-breakpoint
CREATE TABLE `project_settings` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_root` text NOT NULL,
  `exports_root` text NOT NULL,
  `default_canvas_width` integer NOT NULL DEFAULT 1024,
  `default_canvas_height` integer NOT NULL DEFAULT 1024,
  `default_facing` text NOT NULL DEFAULT 'right',
  `default_candidate_count` integer NOT NULL DEFAULT 10,
  `default_animation_fps` integer NOT NULL DEFAULT 12,
  `require_transparency` integer NOT NULL DEFAULT 1,
  `maximum_upload_bytes` integer NOT NULL DEFAULT 10485760,
  `maximum_image_width` integer NOT NULL DEFAULT 4096,
  `maximum_image_height` integer NOT NULL DEFAULT 4096,
  `required_reference_types` text NOT NULL DEFAULT '["LOCKED_DESIGN","SIDE_PROFILE","SILHOUETTE","COLOUR_MATERIAL"]',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
