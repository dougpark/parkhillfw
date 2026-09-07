CREATE TABLE `access_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`street_address` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by_user_id` integer,
	`reviewed_at` integer,
	`notes` text,
	`created_at` integer,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_access_requests_email` ON `access_requests` (`email`);--> statement-breakpoint
CREATE INDEX `idx_access_requests_status` ON `access_requests` (`status`);--> statement-breakpoint
CREATE TABLE `magic_link_rate_limits` (
	`email` text PRIMARY KEY NOT NULL,
	`minute_started_at` integer NOT NULL,
	`daily_started_at` integer NOT NULL,
	`daily_count` integer DEFAULT 0 NOT NULL
);
