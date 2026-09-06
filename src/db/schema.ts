import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const residents = sqliteTable('residents', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});