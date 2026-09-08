ALTER TABLE `documents` ADD `page_id` integer REFERENCES pages(id);--> statement-breakpoint
CREATE INDEX `idx_documents_page` ON `documents` (`page_id`);--> statement-breakpoint
ALTER TABLE `pages` ADD `is_draft` integer DEFAULT true;--> statement-breakpoint
ALTER TABLE `pages` ADD `author_id` integer REFERENCES users(id);