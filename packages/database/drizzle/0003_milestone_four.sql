CREATE INDEX `creature_projects_parent_idx` ON `creature_projects` (`parent_creature_id`);
--> statement-breakpoint
CREATE INDEX `generation_rounds_source_creature_idx` ON `generation_rounds` (`source_creature_id`);
--> statement-breakpoint
CREATE TABLE `evolution_mutations` (
  `id` text PRIMARY KEY NOT NULL,
  `child_creature_id` text NOT NULL,
  `parent_creature_id` text NOT NULL,
  `category` text NOT NULL,
  `description` text NOT NULL,
  `sort_order` integer NOT NULL,
  `intensity` integer,
  `inherited` integer DEFAULT false NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`child_creature_id`) REFERENCES `creature_projects` (`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`parent_creature_id`) REFERENCES `creature_projects` (`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `evolution_mutations_child_idx` ON `evolution_mutations` (`child_creature_id`);
--> statement-breakpoint
CREATE INDEX `evolution_mutations_parent_idx` ON `evolution_mutations` (`parent_creature_id`);
--> statement-breakpoint
PRAGMA optimize;
