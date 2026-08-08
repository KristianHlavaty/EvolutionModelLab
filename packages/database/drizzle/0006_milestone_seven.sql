ALTER TABLE `history_events` ADD `export_run_id` text;
--> statement-breakpoint
CREATE TABLE `export_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `creature_project_id` text NOT NULL,
  `design_lock_id` text NOT NULL,
  `version` integer NOT NULL,
  `export_format` text NOT NULL,
  `status` text DEFAULT 'COMPLETE' NOT NULL,
  `export_path` text NOT NULL,
  `summary_path` text NOT NULL,
  `summary` text NOT NULL,
  `include_prompt_history` integer DEFAULT true NOT NULL,
  `actor` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`creature_project_id`) REFERENCES `creature_projects` (`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`design_lock_id`) REFERENCES `design_locks` (`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `export_runs_creature_idx` ON `export_runs` (`creature_project_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `export_runs_creature_version_unique` ON `export_runs` (`creature_project_id`,`version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `export_runs_path_unique` ON `export_runs` (`export_path`);
--> statement-breakpoint
CREATE INDEX `history_events_export_run_idx` ON `history_events` (`export_run_id`);
--> statement-breakpoint
PRAGMA optimize;
