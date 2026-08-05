ALTER TABLE `history_events` ADD `candidate_id` text;
--> statement-breakpoint
ALTER TABLE `history_events` ADD `generation_round_id` text;
--> statement-breakpoint
ALTER TABLE `history_events` ADD `manifest_version` integer;
--> statement-breakpoint
ALTER TABLE `history_events` ADD `actor` text;
--> statement-breakpoint
CREATE TABLE `design_manifests` (
  `id` text PRIMARY KEY NOT NULL,
  `creature_project_id` text NOT NULL,
  `version` integer DEFAULT 0 NOT NULL,
  `immutable_features` text DEFAULT '[]' NOT NULL,
  `preferred_features` text DEFAULT '[]' NOT NULL,
  `forbidden_features` text DEFAULT '[]' NOT NULL,
  `anatomy_notes` text DEFAULT '' NOT NULL,
  `biological_notes` text DEFAULT '' NOT NULL,
  `style_notes` text DEFAULT '' NOT NULL,
  `palette_notes` text DEFAULT '' NOT NULL,
  `texture_notes` text DEFAULT '' NOT NULL,
  `camera_notes` text DEFAULT '' NOT NULL,
  `lighting_notes` text DEFAULT '' NOT NULL,
  `animation_notes` text DEFAULT '' NOT NULL,
  `canvas_width` integer DEFAULT 1024 NOT NULL,
  `canvas_height` integer DEFAULT 1024 NOT NULL,
  `facing` text DEFAULT 'right' NOT NULL,
  `anchor_x` integer DEFAULT 512 NOT NULL,
  `anchor_y` integer DEFAULT 1023 NOT NULL,
  `transparent_background_required` integer DEFAULT true NOT NULL,
  `explicit_fields` text DEFAULT '[]' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`creature_project_id`) REFERENCES `creature_projects` (`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `design_manifests_creature_unique` ON `design_manifests` (`creature_project_id`);
--> statement-breakpoint
INSERT INTO `design_manifests` (
  `id`, `creature_project_id`, `version`, `canvas_width`, `canvas_height`,
  `facing`, `anchor_x`, `anchor_y`, `transparent_background_required`,
  `created_at`, `updated_at`
)
SELECT
  'manifest-' || creature.id,
  creature.id,
  0,
  COALESCE(settings.default_canvas_width, 1024),
  COALESCE(settings.default_canvas_height, 1024),
  COALESCE(settings.default_facing, 'right'),
  CAST(COALESCE(settings.default_canvas_width, 1024) / 2 AS integer),
  COALESCE(settings.default_canvas_height, 1024) - 1,
  COALESCE(settings.require_transparency, true),
  creature.created_at,
  creature.updated_at
FROM `creature_projects` creature
LEFT JOIN `project_settings` settings ON settings.id = 'default';
--> statement-breakpoint
INSERT INTO `history_events` (
  `id`, `creature_project_id`, `entity_type`, `entity_id`, `action`, `payload`,
  `manifest_version`, `actor`, `created_at`
)
SELECT
  'manifest-created-' || creature.id,
  creature.id,
  'DesignManifest',
  manifest.id,
  'MANIFEST_CREATED',
  '{"source":"MILESTONE_3_MIGRATION_DEFAULTS"}',
  0,
  'SYSTEM',
  creature.updated_at
FROM `creature_projects` creature
JOIN `design_manifests` manifest ON manifest.creature_project_id = creature.id;
--> statement-breakpoint
CREATE TABLE `design_manifest_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `design_manifest_id` text NOT NULL,
  `creature_project_id` text NOT NULL,
  `version` integer NOT NULL,
  `snapshot` text NOT NULL,
  `snapshot_path` text NOT NULL,
  `reason` text NOT NULL,
  `actor` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`design_manifest_id`) REFERENCES `design_manifests` (`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`creature_project_id`) REFERENCES `creature_projects` (`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `design_manifest_versions_manifest_version_unique` ON `design_manifest_versions` (`design_manifest_id`,`version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `design_manifest_versions_snapshot_path_unique` ON `design_manifest_versions` (`snapshot_path`);
--> statement-breakpoint
CREATE TABLE `design_locks` (
  `id` text PRIMARY KEY NOT NULL,
  `creature_project_id` text NOT NULL,
  `lock_number` integer NOT NULL,
  `candidate_id` text NOT NULL,
  `generation_round_id` text NOT NULL,
  `manifest_version_id` text NOT NULL,
  `manifest_version` integer NOT NULL,
  `status` text DEFAULT 'ACTIVE' NOT NULL,
  `active_reference_path` text NOT NULL,
  `archived_reference_path` text,
  `source_file_hash` text NOT NULL,
  `actor` text,
  `locked_at` text NOT NULL,
  `unlocked_at` text,
  FOREIGN KEY (`creature_project_id`) REFERENCES `creature_projects` (`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`generation_round_id`) REFERENCES `generation_rounds` (`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`manifest_version_id`) REFERENCES `design_manifest_versions` (`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `design_locks_creature_number_unique` ON `design_locks` (`creature_project_id`,`lock_number`);
--> statement-breakpoint
CREATE UNIQUE INDEX `design_locks_one_active_per_creature` ON `design_locks` (`creature_project_id`) WHERE `status` = 'ACTIVE';
--> statement-breakpoint
CREATE INDEX `design_locks_candidate_idx` ON `design_locks` (`candidate_id`);
--> statement-breakpoint
PRAGMA optimize;
