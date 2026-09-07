CREATE TABLE `user_login_emails` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`email` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_login_emails_email_unique` ON `user_login_emails` (`email`);--> statement-breakpoint
CREATE INDEX `idx_user_login_emails_user` ON `user_login_emails` (`user_id`);