-- Migration number: 0016 	 2026-09-14T02:01:32.912Z
CREATE INDEX `idx_sessions_last_seen` ON `sessions` (`last_seen_at`,`user_id`);

