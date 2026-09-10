ALTER TABLE `sessions` ADD `user_agent` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `ip_address` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `last_seen_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `is_suspended` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `users` ADD `last_login_at` integer;