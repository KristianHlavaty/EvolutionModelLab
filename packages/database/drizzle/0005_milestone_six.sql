ALTER TABLE `history_events` ADD `animation_id` text;
--> statement-breakpoint
ALTER TABLE `history_events` ADD `animation_frame_id` text;
--> statement-breakpoint
CREATE TABLE `animations` (
  `id` text PRIMARY KEY NOT NULL,
  `creature_project_id` text NOT NULL,
  `design_lock_id` text NOT NULL,
  `name` text NOT NULL,
  `animation_type` text NOT NULL,
  `status` text DEFAULT 'KEY_POSES' NOT NULL,
  `fps` integer DEFAULT 12 NOT NULL,
  `looping` integer DEFAULT true NOT NULL,
  `canvas_width` integer NOT NULL,
  `canvas_height` integer NOT NULL,
  `expected_frame_count` integer DEFAULT 8 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `deleted_at` text,
  FOREIGN KEY (`creature_project_id`) REFERENCES `creature_projects` (`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`design_lock_id`) REFERENCES `design_locks` (`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `animations_creature_idx` ON `animations` (`creature_project_id`);
--> statement-breakpoint
CREATE INDEX `animations_lock_idx` ON `animations` (`design_lock_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `animations_creature_name_unique` ON `animations` (`creature_project_id`,`name`) WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE TABLE `animation_frames` (
  `id` text PRIMARY KEY NOT NULL,
  `animation_id` text NOT NULL,
  `frame_number` integer NOT NULL,
  `frame_role` text NOT NULL,
  `image_path` text NOT NULL,
  `thumbnail_path` text NOT NULL,
  `source` text NOT NULL,
  `original_filename` text NOT NULL,
  `duration_ms` integer DEFAULT 83 NOT NULL,
  `width` integer NOT NULL,
  `height` integer NOT NULL,
  `has_alpha` integer NOT NULL,
  `file_hash` text NOT NULL,
  `perceptual_hash` text NOT NULL,
  `bounding_box_x` integer NOT NULL,
  `bounding_box_y` integer NOT NULL,
  `bounding_box_width` integer NOT NULL,
  `bounding_box_height` integer NOT NULL,
  `center_x` real NOT NULL,
  `center_y` real NOT NULL,
  `opaque_pixel_count` integer NOT NULL,
  `touches_canvas_edge` integer DEFAULT false NOT NULL,
  `validation_status` text DEFAULT 'VALID' NOT NULL,
  `validation_messages` text DEFAULT '[]' NOT NULL,
  `marked_for_repair` integer DEFAULT false NOT NULL,
  `notes` text DEFAULT '' NOT NULL,
  `replaces_frame_id` text,
  `created_at` text NOT NULL,
  `deleted_at` text,
  FOREIGN KEY (`animation_id`) REFERENCES `animations` (`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `animation_frames_animation_idx` ON `animation_frames` (`animation_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `animation_frames_number_unique` ON `animation_frames` (`animation_id`,`frame_number`) WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `animation_frames_hash_unique` ON `animation_frames` (`animation_id`,`file_hash`) WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE TABLE `animation_prompts` (
  `id` text PRIMARY KEY NOT NULL,
  `animation_id` text NOT NULL,
  `prompt_type` text NOT NULL,
  `related_frame_id` text,
  `generated_prompt` text NOT NULL,
  `prompt_path` text NOT NULL,
  `context_path` text NOT NULL,
  `actor` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`animation_id`) REFERENCES `animations` (`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `animation_prompts_animation_idx` ON `animation_prompts` (`animation_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `animation_prompts_path_unique` ON `animation_prompts` (`prompt_path`);
--> statement-breakpoint
CREATE INDEX `history_events_animation_idx` ON `history_events` (`animation_id`);
--> statement-breakpoint
CREATE INDEX `history_events_animation_frame_idx` ON `history_events` (`animation_frame_id`);
--> statement-breakpoint
PRAGMA optimize;
