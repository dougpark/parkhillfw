CREATE TABLE `activity_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` integer,
	`target_user_id` integer,
	`category` text NOT NULL,
	`action` text NOT NULL,
	`details` text,
	`created_at` integer,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_activity_logs_category` ON `activity_logs` (`category`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_activity_logs_target` ON `activity_logs` (`target_user_id`);