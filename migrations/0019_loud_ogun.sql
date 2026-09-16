CREATE TABLE `document_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
ALTER TABLE `documents` ADD `folder_id` integer REFERENCES document_folders(id);--> statement-breakpoint
ALTER TABLE `documents` ADD `name` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `description` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `is_draft` integer DEFAULT true;--> statement-breakpoint
ALTER TABLE `documents` ADD `updated_at` integer;--> statement-breakpoint
CREATE INDEX `idx_documents_folder` ON `documents` (`folder_id`);