ALTER TABLE `magic_tokens` ADD `code_hash` text;--> statement-breakpoint
ALTER TABLE `magic_tokens` ADD `code_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_magic_tokens_email` ON `magic_tokens` (`email`);