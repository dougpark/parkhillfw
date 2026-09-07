# users schema
- To establish a flexible, secure link between authentication accounts (users) and physical directory records (residents), you should place a nullable Foreign Key on the users table that points to the residents table, supplemented by a match-status flag.

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { residents } from './schema';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(), // Email used for Magic Link login
  
  // Link to Directory Resident (Nullable)
  residentId: integer('resident_id').references(() => residents.id, { onDelete: 'set null' }),
  
  // Link Verification Status: 'auto_matched' | 'admin_verified' | 'unlinked'
  linkStatus: text('link_status').notNull().default('unlinked'),
  
  // Role & Permissions Flags
  isOwner: integer('is_owner', { mode: 'boolean' }).default(false),
  isAdmin: integer('is_admin', { mode: 'boolean' }).default(false),
  isPageEditor: integer('is_page_editor', { mode: 'boolean' }).default(false),
  isDirectoryEditor: integer('is_directory_editor', { mode: 'boolean' }).default(false),

  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
```