# Directory schema

```ts
// Drizzle ORM Schema (src/db/schema.ts)
// Here is how this maps cleanly to Drizzle ORM for Cloudflare D1:

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// 1. Physical Household / Property
export const households = sqliteTable('households', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  streetAddress: text('street_address').notNull(), // e.g., "2200 Winton Terrace East"
  yearMovedIn: integer('year_moved_in'),
  
  // Membership Statuses
  parkHillMember: integer('park_hill_member', { mode: 'boolean' }).default(false),
  securityMember: integer('security_member', { mode: 'boolean' }).default(false),
  
  pets: text('pets'), // "2 Dogs (Golden Retrievers)"
  photoKey: text('photo_key'), // R2 storage key instead of full external URL
  notes: text('notes'),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// 2. Adult Residents / Members tied to Household
export const residents = sqliteTable('residents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  householdId: integer('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  isPrimaryContact: integer('is_primary_contact', { mode: 'boolean' }).default(false),
  
  email: text('email'),
  phoneMobile: text('phone_mobile'),
  phoneHome: text('phone_home'),
  phoneWork: text('phone_work'),
  occupation: text('occupation'),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// 3. Children & Neighborhood Services Offered
export const children = sqliteTable('children', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  householdId: integer('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  
  name: text('name').notNull(),
  birthYear: integer('birth_year'),
  school: text('school'),
  occupation: text('occupation'), // "Student", "Lawn Care", etc.
  residenceLocation: text('residence_location'), // e.g., "Seattle" if away at college
  
  // Directory Service Flags
  babysitting: integer('babysitting', { mode: 'boolean' }).default(false),
  petSitting: integer('pet_sitting', { mode: 'boolean' }).default(false),
  specialSkills: text('special_skills'),
});