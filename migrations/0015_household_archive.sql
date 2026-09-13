CREATE TABLE `household_archive` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`address_id` integer NOT NULL,
	`archived_at` integer NOT NULL,
	`archived_by_admin_id` integer,
	`snapshot` text NOT NULL,
	FOREIGN KEY (`address_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`archived_by_admin_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_household_archive_address` ON `household_archive` (`address_id`);--> statement-breakpoint
CREATE INDEX `idx_household_archive_archived_at` ON `household_archive` (`archived_at`);