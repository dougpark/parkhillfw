CREATE TABLE `children` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`name` text NOT NULL,
	`birth_year` integer,
	`school` text,
	`occupation` text,
	`residence_location` text,
	`babysitting` integer DEFAULT false,
	`pet_sitting` integer DEFAULT false,
	`special_skills` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_children_household` ON `children` (`household_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by_user_id` integer,
	`created_at` integer,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_documents_r2_key_unique` ON `documents` (`r2_key`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`street_address` text NOT NULL,
	`year_moved_in` integer,
	`park_hill_member` integer DEFAULT false,
	`security_member` integer DEFAULT false,
	`pets` text,
	`photo_key` text,
	`notes` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_households_address` ON `households` (`street_address`);--> statement-breakpoint
CREATE TABLE `info_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text_md` text NOT NULL,
	`priority` integer DEFAULT false,
	`start_date` integer,
	`end_date` integer,
	`bg_color` text DEFAULT '#1a73e8',
	`icon_name` text,
	`r2_image_key` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `magic_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_magic_tokens_token_unique` ON `magic_tokens` (`token`);--> statement-breakpoint
CREATE TABLE `menus` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer,
	`title` text NOT NULL,
	`page_id` integer,
	`target_url` text,
	`display_order` integer DEFAULT 0,
	`is_public` integer DEFAULT false,
	FOREIGN KEY (`parent_id`) REFERENCES `menus`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_menus_parent` ON `menus` (`parent_id`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`body_md` text NOT NULL,
	`is_public` integer DEFAULT false,
	`is_homepage_card` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pages_slug_unique` ON `pages` (`slug`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`resident_id` integer,
	`link_status` text DEFAULT 'unlinked' NOT NULL,
	`is_owner` integer DEFAULT false,
	`is_admin` integer DEFAULT false,
	`is_page_editor` integer DEFAULT false,
	`is_directory_editor` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_resident` ON `users` (`resident_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_residents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`is_primary_contact` integer DEFAULT false,
	`email` text,
	`phone_mobile` text,
	`phone_home` text,
	`phone_work` text,
	`occupation` text,
	`created_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_residents`("id", "household_id", "first_name", "last_name", "is_primary_contact", "email", "phone_mobile", "phone_home", "phone_work", "occupation", "created_at") SELECT "id", "household_id", "first_name", "last_name", "is_primary_contact", "email", "phone_mobile", "phone_home", "phone_work", "occupation", "created_at" FROM `residents`;--> statement-breakpoint
DROP TABLE `residents`;--> statement-breakpoint
ALTER TABLE `__new_residents` RENAME TO `residents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_residents_household` ON `residents` (`household_id`);--> statement-breakpoint
CREATE INDEX `idx_residents_email` ON `residents` (`email`);--> statement-breakpoint
CREATE INDEX `idx_residents_name` ON `residents` (`last_name`,`first_name`);