import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import { hashToken, findUserBySession, sessionCookie, SESSION_COOKIE, SESSION_DAYS, SESSION_RENEW_THRESHOLD_DAYS } from './auth';
import { users, sessions } from '../db/schema';

function setupTestDb() {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            resident_id INTEGER,
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

        CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL,
            user_agent TEXT,
            ip_address TEXT,
            last_seen_at INTEGER,
            created_at INTEGER
        );
    `);
    return drizzle(sqlite);
}

describe('Rolling Session Auth Tests', () => {
    test('sessionCookie formats HttpOnly Max-Age cookie correctly', () => {
        const futureDate = new Date(Date.now() + 400 * 24 * 60 * 60_000);
        const cookieStr = sessionCookie('test-token', futureDate, true);
        expect(cookieStr).toContain(`${SESSION_COOKIE}=test-token`);
        expect(cookieStr).toContain('Path=/');
        expect(cookieStr).toContain('HttpOnly');
        expect(cookieStr).toContain('SameSite=Lax');
        expect(cookieStr).toContain('Secure');
        expect(cookieStr).toContain('Max-Age=');
    });

    test('SESSION_DAYS and SESSION_RENEW_THRESHOLD_DAYS are configured properly', () => {
        expect(SESSION_DAYS).toBe(400);
        expect(SESSION_RENEW_THRESHOLD_DAYS).toBe(300);
    });

    test('findUserBySession does not renew session if remaining lifetime is > 300 days', async () => {
        const db = setupTestDb();
        const rawSession = 'fresh-session-token';
        const sessionHash = await hashToken(rawSession);

        const [insertedUser] = await db.insert(users).values({ email: 'resident@example.com' }).returning();
        if (!insertedUser) throw new Error('User insertion failed');

        // Session created with 350 days remaining (> 300 threshold)
        const expiresAt = new Date(Date.now() + 350 * 24 * 60 * 60_000);
        await db.insert(sessions).values({
            id: sessionHash,
            userId: insertedUser.id,
            expiresAt,
        });

        const result = await findUserBySession(db as any, rawSession);
        expect(result).not.toBeNull();
        expect(result?.user.id).toBe(insertedUser.id);
        expect(result?.renewedExpiresAt).toBeUndefined();

        // Database expiresAt should remain unchanged (within second precision)
        const sessionInDb = await db.select().from(sessions).where(eq(sessions.id, sessionHash)).get();
        expect(Math.floor(sessionInDb!.expiresAt.getTime() / 1000)).toBe(Math.floor(expiresAt.getTime() / 1000));
    });

    test('findUserBySession rolls session forward if remaining lifetime is <= 300 days', async () => {
        const db = setupTestDb();
        const rawSession = 'aging-session-token';
        const sessionHash = await hashToken(rawSession);

        const [insertedUser] = await db.insert(users).values({ email: 'elderly.resident@example.com' }).returning();
        if (!insertedUser) throw new Error('User insertion failed');

        // Session created 200 days ago, so only 200 days remaining (<= 300 threshold)
        const oldExpiresAt = new Date(Date.now() + 200 * 24 * 60 * 60_000);
        await db.insert(sessions).values({
            id: sessionHash,
            userId: insertedUser.id,
            expiresAt: oldExpiresAt,
        });

        const result = await findUserBySession(db as any, rawSession);
        expect(result).not.toBeNull();
        expect(result?.user.id).toBe(insertedUser.id);
        expect(result?.renewedExpiresAt).toBeDefined();

        // renewedExpiresAt should be ~400 days in the future
        const expectedMinMs = Date.now() + 399 * 24 * 60 * 60_000;
        expect(result?.renewedExpiresAt!.getTime()).toBeGreaterThan(expectedMinMs);

        // Database expiresAt should be updated to match renewedExpiresAt (within second precision)
        const sessionInDb = await db.select().from(sessions).where(eq(sessions.id, sessionHash)).get();
        expect(Math.floor(sessionInDb!.expiresAt.getTime() / 1000)).toBe(Math.floor(result!.renewedExpiresAt!.getTime() / 1000));
    });

    test('findUserBySession returns null for expired session', async () => {
        const db = setupTestDb();
        const rawSession = 'expired-session-token';
        const sessionHash = await hashToken(rawSession);

        const [insertedUser] = await db.insert(users).values({ email: 'old@example.com' }).returning();
        if (!insertedUser) throw new Error('User insertion failed');

        // Session expired 1 hour ago
        const pastExpiresAt = new Date(Date.now() - 60 * 60_000);
        await db.insert(sessions).values({
            id: sessionHash,
            userId: insertedUser.id,
            expiresAt: pastExpiresAt,
        });

        const result = await findUserBySession(db as any, rawSession);
        expect(result).toBeNull();
    });

    test('findUserBySession captures previousLastSeenAt and throttles lastSeenAt DB updates to 15 minutes', async () => {
        const db = setupTestDb();
        const rawSession = 'throttled-session-token';
        const sessionHash = await hashToken(rawSession);

        const [insertedUser] = await db.insert(users).values({ email: 'resident.throttle@example.com' }).returning();
        if (!insertedUser) throw new Error('User insertion failed');

        // Session last seen 2 hours ago
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000);
        const expiresAt = new Date(Date.now() + 350 * 24 * 60 * 60_000);
        await db.insert(sessions).values({
            id: sessionHash,
            userId: insertedUser.id,
            expiresAt,
            lastSeenAt: twoHoursAgo,
        });

        // First call: previousLastSeenAt should be twoHoursAgo (within second precision)
        const firstResult = await findUserBySession(db as any, rawSession);
        expect(Math.floor(firstResult!.previousLastSeenAt!.getTime() / 1000)).toBe(Math.floor(twoHoursAgo.getTime() / 1000));

        // The session in DB should now have been updated to ~now
        const sessionInDbAfterFirst = await db.select().from(sessions).where(eq(sessions.id, sessionHash)).get();
        const firstUpdatedLastSeenAt = sessionInDbAfterFirst!.lastSeenAt;
        expect(firstUpdatedLastSeenAt!.getTime()).toBeGreaterThan(twoHoursAgo.getTime());

        // Second call immediately after: previousLastSeenAt should be firstUpdatedLastSeenAt, but DB update skipped because < 15 mins
        const secondResult = await findUserBySession(db as any, rawSession);
        expect(secondResult?.previousLastSeenAt?.getTime()).toBe(firstUpdatedLastSeenAt!.getTime());

        const sessionInDbAfterSecond = await db.select().from(sessions).where(eq(sessions.id, sessionHash)).get();
        expect(sessionInDbAfterSecond!.lastSeenAt!.getTime()).toBe(firstUpdatedLastSeenAt!.getTime());
    });
});
