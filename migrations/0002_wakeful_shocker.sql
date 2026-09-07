PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_households` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`street_address` text NOT NULL,
	`year_moved_in` integer,
	`park_hill_member` text,
	`security_member` integer DEFAULT false,
	`pets` text,
	`photo_key` text,
	`notes` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_households`("id", "street_address", "year_moved_in", "park_hill_member", "security_member", "pets", "photo_key", "notes", "created_at", "updated_at") SELECT "id", "street_address", "year_moved_in", "park_hill_member", "security_member", "pets", "photo_key", "notes", "created_at", "updated_at" FROM `households`;--> statement-breakpoint
DROP TABLE `households`;--> statement-breakpoint
ALTER TABLE `__new_households` RENAME TO `households`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_households_address` ON `households` (`street_address`);