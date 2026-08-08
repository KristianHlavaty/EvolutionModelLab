ALTER TABLE `history_events` ADD `reference_image_id` text;
--> statement-breakpoint
CREATE TABLE `reference_images` (
  `id` text PRIMARY KEY NOT NULL,
  `creature_project_id` text NOT NULL,
  `design_lock_id` text NOT NULL,
  `reference_type` text NOT NULL,
  `status` text DEFAULT 'REQUESTED' NOT NULL,
  `generated_prompt` text NOT NULL,
  `prompt_path` text NOT NULL,
  `context_path` text NOT NULL,
  `image_path` text,
  `thumbnail_path` text,
  `original_filename` text,
  `notes` text DEFAULT '' NOT NULL,
  `validation` text DEFAULT '{}' NOT NULL,
  `width` integer,
  `height` integer,
  `has_alpha` integer,
  `file_hash` text,
  `mime_type` text,
  `approved` integer DEFAULT false NOT NULL,
  `actor` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `approved_at` text,
  FOREIGN KEY (`creature_project_id`) REFERENCES `creature_projects` (`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`design_lock_id`) REFERENCES `design_locks` (`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `reference_images_creature_idx` ON `reference_images` (`creature_project_id`);
--> statement-breakpoint
CREATE INDEX `reference_images_lock_type_idx` ON `reference_images` (`design_lock_id`,`reference_type`);
--> statement-breakpoint
CREATE INDEX `reference_images_status_idx` ON `reference_images` (`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `reference_images_prompt_path_unique` ON `reference_images` (`prompt_path`);
--> statement-breakpoint
CREATE UNIQUE INDEX `reference_images_image_path_unique` ON `reference_images` (`image_path`);
--> statement-breakpoint
CREATE INDEX `history_events_reference_image_idx` ON `history_events` (`reference_image_id`);
--> statement-breakpoint
PRAGMA optimize;
