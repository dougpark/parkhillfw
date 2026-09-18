-- Migration number: 0020 	 2026-09-18T15:25:00.759Z
ALTER TABLE `users` ADD `is_finance` integer DEFAULT false;
