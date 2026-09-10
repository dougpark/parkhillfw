# Last Active
- since we use long-lived sessions, updating the last_active_at timestamp on every request can be inefficient.

Updating a database table on every single page load or screen render creates unnecessary database writes and can quickly exhaust free tiers or cause performance bottlenecks.
Since your main goals are tracking overall user activity, calculating access frequency, and understanding feature usage, a hybrid approach using batched tracking and lightweight telemetry is much more efficient.

## Strategy 1: "Throttled" Last-Seen Timestamp
To know when a neighbor last accessed the portal (without writing to the DB on every click), only update their last_active_at timestamp if a certain time threshold has passed (e.g., once every 6 or 24 hours).
User visits page ──► Check session / cookie
                          │
                          ▼
             Is `last_active_at` > 6 hours old?
             ├── YES ──► Update `last_active_at` in DB
             └── NO  ──► Skip DB write (do nothing)

Implementation Pattern:
• Store last_active_at as a DATETIME column on your users table.
• On incoming requests, compare the current time with the timestamp in memory or in the session.
• If now - last_active_at > 6 hours, fire an asynchronous background update (e.g., ctx.waitUntil() in a Cloudflare Worker) to update the record.


## Recommended Setup for Cloudflare / Lightweight Stack
If your portal is running on a lightweight stack (like Cloudflare Workers + D1 or SQLite):

1. User Table Timestamp: Maintain a last_login_at (updated only when authenticating) and a last_active_at (updated at most once every 6 hours per user).

2. Feature Event Table: Create a lightweight usage_events table to log key interactions:

CREATE TABLE usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    feature_name TEXT NOT NULL, -- e.g.'directory_view', 'page_read', 'admin_access'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

## Background Writes: 
Wrap your event logging in non-blocking background tasks (ctx.waitUntil(...)) so the elderly user’s page load speed is never delayed by database logging.

