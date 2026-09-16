CREATE TABLE `photo_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`folder_id` integer NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`event_date` integer,
	`is_public` integer DEFAULT true,
	`is_draft` integer DEFAULT true,
	`cover_photo_id` integer,
	`display_order` integer DEFAULT 0,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`folder_id`) REFERENCES `photo_folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_photo_events_slug_unique` ON `photo_events` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_photo_events_folder` ON `photo_events` (`folder_id`,`display_order`);--> statement-breakpoint
CREATE TABLE `photo_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`display_order` integer DEFAULT 0,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_photo_folders_slug_unique` ON `photo_folders` (`slug`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`r2_key` text NOT NULL,
	`r2_thumb_key` text NOT NULL,
	`r2_display_key` text NOT NULL,
	`caption` text,
	`width` integer,
	`height` integer,
	`display_order` integer DEFAULT 0,
	`uploaded_by_user_id` integer,
	`uploaded_at` integer,
	FOREIGN KEY (`event_id`) REFERENCES `photo_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_photos_event` ON `photos` (`event_id`,`display_order`);