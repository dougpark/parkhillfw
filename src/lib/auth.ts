import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { magicTokens, sessions, users, residents, userLoginEmails } from '../db/schema';
import { asc } from 'drizzle-orm';

export const SESSION_COOKIE = 'parkhill_session';
export const SESSION_DAYS = 400;
export const SESSION_RENEW_THRESHOLD_DAYS = 300;
const MAGIC_LINK_MINUTES = 15;
const APPROVAL_LINK_HOURS = 48;
const MAX_CODE_ATTEMPTS = 5;

export async function hashToken(token: string): Promise<string> {
    const bytes = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export function createMagicToken(): string {
    return crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
}

export function createSixDigitCode(): string {
    const bytes = crypto.getRandomValues(new Uint32Array(1));
    return (bytes[0]! % 1_000_000).toString().padStart(6, '0');
}

export async function createMagicLinkToken(
    db: ReturnType<typeof drizzle>,
    email: string,
    lifetimeMinutes = MAGIC_LINK_MINUTES,
) {
    // Only one live token/code pair per email — consuming either invalidates both.
    await db.delete(magicTokens).where(eq(magicTokens.email, email));

    const rawToken = createMagicToken();
    const rawCode = createSixDigitCode();
    const expiresAt = new Date(Date.now() + lifetimeMinutes * 60_000);
    await db.insert(magicTokens).values({
        email,
        token: await hashToken(rawToken),
        codeHash: await hashToken(rawCode),
        expiresAt,
    });
    return { rawToken, rawCode };
}

/**
 * Validates a manually-entered 6-digit code and consumes its token row on success.
 * Returns the email to complete login with, or an error to show the user.
 */
export async function verifyCodeAndConsume(
    db: ReturnType<typeof drizzle>,
    email: string,
    code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const row = await db.select().from(magicTokens).where(eq(magicTokens.email, email)).get();
    if (!row || row.expiresAt.getTime() <= Date.now() || !row.codeHash) {
        return { ok: false, error: 'This code is invalid or has expired. Please request a new one.' };
    }
    if (row.codeAttempts >= MAX_CODE_ATTEMPTS) {
        await db.delete(magicTokens).where(eq(magicTokens.id, row.id));
        return { ok: false, error: 'Too many incorrect attempts. Please request a new code.' };
    }

    const codeHash = await hashToken(code);
    if (codeHash !== row.codeHash) {
        await db.update(magicTokens).set({ codeAttempts: row.codeAttempts + 1 }).where(eq(magicTokens.id, row.id));
        return { ok: false, error: 'That code is incorrect. Please try again.' };
    }

    await db.delete(magicTokens).where(eq(magicTokens.id, row.id));
    return { ok: true };
}

/**
 * Shared post-credential-verification flow: resolve/create the users row (merging into the
 * canonical account for a resident), reject suspended accounts, and issue a session.
 */
export async function completeLogin(
    db: ReturnType<typeof drizzle>,
    rawEmail: string,
    device?: { userAgent?: string | null; ipAddress?: string | null },
): Promise<{ ok: true; user: typeof users.$inferSelect; rawSession: string; expiresAt: Date } | { ok: false; error: string; status: 403 }> {
    const email = normalizeEmail(rawEmail);
    let user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
        const alternate = await db.select({ userId: userLoginEmails.userId })
            .from(userLoginEmails).where(eq(userLoginEmails.email, email)).get();
        if (alternate) user = await db.select().from(users).where(eq(users.id, alternate.userId)).get();
    }
    if (!user) {
        const matchedResident = await db.select().from(residents).where(eq(residents.email, email)).get();
        user = await db.insert(users).values({
            email,
            residentId: matchedResident?.id ?? null,
            linkStatus: matchedResident ? 'auto_matched' : 'unlinked',
        }).returning().then((rows) => rows[0]);
    } else if (!user.residentId) {
        const matchedResident = await db.select().from(residents).where(eq(residents.email, email)).get();
        if (matchedResident) {
            user = await db.update(users).set({ residentId: matchedResident.id, linkStatus: 'auto_matched', updatedAt: new Date() })
                .where(eq(users.id, user.id)).returning().then((rows) => rows[0]);
        }
    }

    if (user!.residentId) {
        const canonicalUser = await db.select().from(users)
            .where(eq(users.residentId, user!.residentId))
            .orderBy(asc(users.id)).get();
        if (canonicalUser && canonicalUser.id !== user!.id) {
            if (email !== normalizeEmail(canonicalUser.email)) {
                await db.insert(userLoginEmails).values({ userId: canonicalUser.id, email })
                    .onConflictDoNothing();
            }
            user = canonicalUser;
        }
    }

    if (user!.isSuspended) return { ok: false, error: 'This account has been suspended.', status: 403 };

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user!.id));

    const { rawSession, expiresAt } = await createSession(db, user!.id, device);
    return { ok: true, user: user!, rawSession, expiresAt };
}

export const approvalLinkLifetimeMinutes = APPROVAL_LINK_HOURS * 60;

export async function createSession(
    db: ReturnType<typeof drizzle>,
    userId: number,
    device?: { userAgent?: string | null; ipAddress?: string | null },
) {
    const rawSession = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60_000);
    const now = new Date();
    await db.insert(sessions).values({
        id: await hashToken(rawSession),
        userId,
        expiresAt,
        userAgent: device?.userAgent ?? null,
        ipAddress: device?.ipAddress ?? null,
        lastSeenAt: now,
    });
    return { rawSession, expiresAt };
}

export async function findUserBySession(
    db: ReturnType<typeof drizzle>,
    rawSession: string,
): Promise<{ user: typeof users.$inferSelect; renewedExpiresAt?: Date } | null> {
    const sessionId = await hashToken(rawSession);
    const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    const user = await db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!user || user.isSuspended) return null;

    const now = Date.now();
    const remainingMs = session.expiresAt.getTime() - now;
    const thresholdMs = SESSION_RENEW_THRESHOLD_DAYS * 24 * 60 * 60_000;

    if (remainingMs < thresholdMs) {
        const renewedExpiresAt = new Date(now + SESSION_DAYS * 24 * 60 * 60_000);
        await db
            .update(sessions)
            .set({ lastSeenAt: new Date(now), expiresAt: renewedExpiresAt })
            .where(eq(sessions.id, sessionId));
        return { user, renewedExpiresAt };
    }

    await db.update(sessions).set({ lastSeenAt: new Date(now) }).where(eq(sessions.id, sessionId));
    return { user };
}

export function sessionCookie(value: string, expiresAt: Date, secure: boolean): string {
    return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor((expiresAt.getTime() - Date.now()) / 1000)}${secure ? '; Secure' : ''}`;
}

export function expiredSessionCookie(secure: boolean): string {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
