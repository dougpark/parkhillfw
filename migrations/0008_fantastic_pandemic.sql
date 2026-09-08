DROP INDEX `idx_menus_parent`;--> statement-breakpoint
ALTER TABLE `menus` ADD `kind` text DEFAULT 'menu' NOT NULL;--> statement-breakpoint
ALTER TABLE `menus` ADD `slug` text;--> statement-breakpoint
ALTER TABLE `menus` ADD `description` text;--> statement-breakpoint
ALTER TABLE `menus` ADD `icon_name` text;--> statement-breakpoint
ALTER TABLE `menus` ADD `is_draft` integer DEFAULT true;--> statement-breakpoint
ALTER TABLE `menus` ADD `created_at` integer;--> statement-breakpoint
ALTER TABLE `menus` ADD `updated_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_menus_slug_unique` ON `menus` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_menus_parent` ON `menus` (`parent_id`,`display_order`);