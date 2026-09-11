import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import { households, residents, users } from '../db/schema';

function setupDirectoryDb() {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
        CREATE TABLE households (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            street_address TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            year_moved_in INTEGER,
            park_hill_member TEXT,
            security_member INTEGER DEFAULT 0,
            pets TEXT,
            photo_key TEXT,
            notes TEXT,
            directory_confirmed_at INTEGER,
            created_at INTEGER,
            updated_at INTEGER
        );

        CREATE TABLE residents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            is_primary_contact INTEGER DEFAULT 0,
            email TEXT,
            phone_mobile TEXT,
            phone_home TEXT,
            phone_work TEXT,
            occupation TEXT,
            created_at INTEGER
        );

        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
            link_status TEXT NOT NULL DEFAULT 'unlinked',
            is_owner INTEGER DEFAULT 0,
            is_admin INTEGER DEFAULT 0,
            is_page_editor INTEGER DEFAULT 0,
            is_directory_editor INTEGER DEFAULT 0,
            is_suspended INTEGER DEFAULT 0,
            last_login_at INTEGER,
            created_at INTEGER,
            updated_at INTEGER
        );
    `);
    return drizzle(sqlite);
}

describe('Directory Reminder Verification Tests', () => {
    const SIX_MONTHS_MS = 180 * 24 * 60 * 60_000;

    test('new/existing household with no updatedAt or directoryConfirmedAt needs review', async () => {
        const db = setupDirectoryDb();
        const [household] = await db.insert(households).values({
            streetAddress: '1234 Park Hill Dr',
            updatedAt: null,
            directoryConfirmedAt: null,
        }).returning();

        const lastTouchTime = Math.max(
            household.updatedAt ? new Date(household.updatedAt).getTime() : 0,
            household.directoryConfirmedAt ? new Date(household.directoryConfirmedAt).getTime() : 0
        );

        const needsDirectoryReview = lastTouchTime === 0 || Date.now() - lastTouchTime > SIX_MONTHS_MS;
        expect(needsDirectoryReview).toBe(true);
    });

    test('household with touch older than 6 months needs review', async () => {
        const db = setupDirectoryDb();
        const sevenMonthsAgo = new Date(Date.now() - 210 * 24 * 60 * 60_000);
        const [household] = await db.insert(households).values({
            streetAddress: '1234 Park Hill Dr',
            updatedAt: sevenMonthsAgo,
            directoryConfirmedAt: null,
        }).returning();

        const lastTouchTime = Math.max(
            household.updatedAt ? new Date(household.updatedAt).getTime() : 0,
            household.directoryConfirmedAt ? new Date(household.directoryConfirmedAt).getTime() : 0
        );

        const needsDirectoryReview = lastTouchTime === 0 || Date.now() - lastTouchTime > SIX_MONTHS_MS;
        expect(needsDirectoryReview).toBe(true);
    });

    test('confirming directory sets directoryConfirmedAt and clears needsDirectoryReview', async () => {
        const db = setupDirectoryDb();
        const [household] = await db.insert(households).values({
            streetAddress: '1234 Park Hill Dr',
            updatedAt: new Date(Date.now() - 200 * 24 * 60 * 60_000),
            directoryConfirmedAt: null,
        }).returning();

        // Confirm now
        const now = new Date();
        await db.update(households).set({ directoryConfirmedAt: now }).where(eq(households.id, household.id));

        const updatedHousehold = await db.select().from(households).where(eq(households.id, household.id)).get();
        const lastTouchTime = Math.max(
            updatedHousehold!.updatedAt ? new Date(updatedHousehold!.updatedAt).getTime() : 0,
            updatedHousehold!.directoryConfirmedAt ? new Date(updatedHousehold!.directoryConfirmedAt).getTime() : 0
        );

        const needsDirectoryReview = lastTouchTime === 0 || Date.now() - lastTouchTime > SIX_MONTHS_MS;
        expect(needsDirectoryReview).toBe(false);
    });
});
