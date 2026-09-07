CREATE TABLE `household_favorites` (
	`user_id` integer NOT NULL,
	`household_id` integer NOT NULL,
	`created_at` integer,
	PRIMARY KEY(`user_id`, `household_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_household_favorites_household` ON `household_favorites` (`household_id`);