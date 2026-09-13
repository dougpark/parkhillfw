CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer,
	`updated_by_user_id` integer,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_settings_key_unique` ON `settings` (`key`);
--> statement-breakpoint
INSERT INTO `settings` (`key`, `value`, `updated_at`) VALUES ('admin_email', '"parkdn@gmail.com"', unixepoch());