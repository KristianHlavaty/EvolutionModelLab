ALTER TABLE `generation_rounds` ADD `feedback_snapshot` text;
--> statement-breakpoint
ALTER TABLE `candidates` ADD `contact_sheet_import_id` text;
--> statement-breakpoint
ALTER TABLE `candidates` ADD `crop_x` integer;
--> statement-breakpoint
ALTER TABLE `candidates` ADD `crop_y` integer;
--> statement-breakpoint
ALTER TABLE `candidates` ADD `crop_width` integer;
--> statement-breakpoint
ALTER TABLE `candidates` ADD `crop_height` integer;
--> statement-breakpoint
CREATE TABLE `contact_sheet_imports` (
  `id` text PRIMARY KEY NOT NULL,
  `generation_round_id` text NOT NULL,
  `original_path` text NOT NULL,
  `original_filename` text NOT NULL,
  `width` integer NOT NULL,
  `height` integer NOT NULL,
  `file_hash` text NOT NULL,
  `rows` integer NOT NULL,
  `columns` integer NOT NULL,
  `margin_top` integer NOT NULL,
  `margin_right` integer NOT NULL,
  `margin_bottom` integer NOT NULL,
  `margin_left` integer NOT NULL,
  `horizontal_gap` integer NOT NULL,
  `vertical_gap` integer NOT NULL,
  `crop_rectangles` text NOT NULL,
  `status` text NOT NULL DEFAULT 'PREVIEW',
  `created_at` text NOT NULL,
  `confirmed_at` text,
  FOREIGN KEY (`generation_round_id`) REFERENCES `generation_rounds` (`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `contact_sheet_imports_round_idx` ON `contact_sheet_imports` (`generation_round_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_sheet_imports_round_hash_unique` ON `contact_sheet_imports` (`generation_round_id`,`file_hash`);
