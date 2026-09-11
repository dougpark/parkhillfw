# update directory reminder 

For a community directory where information naturally gets stale, combining a data-driven tracking model with a gentle two-tier reminder system gives you the best results without bothering your neighbors.

## Step 1: Tracking the Update Timestamp
To track changes accurately without over-complicating your database, store two distinct timestamp fields in your user or profile table:
• updated_at: Set automatically on any profile save.
• confirmed_at: Set when a user clicks a "Everything is up to date" button without making changes.

```sql
-- SQLite / Cloudflare D1 Schema Example
ALTER TABLE users ADD COLUMN directory_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN directory_confirmed_at DATETIME DEFAULT CURRENT_TIMESTAMP;
```

How to calculate "Last Touch":
Your system checks the most recent of the two dates:

```ts
$$\text{Last Touch} = \max(\text{directory\_updated\_at}, \text{directory\_confirmed\_at})$$
```

## Step 2: The Two-Tiered Prompt System
Relying on a single notification channel can lead to ignored messages. A blended approach works best:

1. In-App Homepage Banner (Soft Reminder)
• Trigger: User logs into the portal AND \text{Last Touch} > 6 \text{ months}.

• User Experience: Show a subtle, non-intrusive banner or card below the navbar: 
"Is your directory info still current? 
[ Edit Directory ] or [ Looks Good ]"
• Why it works: Clicking "Looks Good" updates directory_confirmed_at instantly to today's date, dismissing the prompt for another 6 months without forcing them to edit anything.


## Recommended Workflow Implementation
- clicking Edit Directory takes them immediatly to the "Edit My Household" page.
- Add a "Quick Confirm" API Route: When a user clicks "Looks Good", execute a lightweight request that sets directory_confirmed_at = CURRENT_TIMESTAMP so the prompt disappears immediately.
