import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { magicTokens, sessions, users } from '../db/schema';

export const SESSION_COOKIE = 'parkhill_session';
const SESSION_DAYS = 400;
const MAGIC_LINK_MINUTES = 15;
const APPROVAL_LINK_HOURS = 48;

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

export async function createMagicLinkToken(
    db: ReturnType<typeof drizzle>,
    email: string,
    lifetimeMinutes = MAGIC_LINK_MINUTES,
) {
    const rawToken = createMagicToken();
    const expiresAt = new Date(Date.now() + lifetimeMinutes * 60_000);
    await db.insert(magicTokens).values({ email, token: await hashToken(rawToken), expiresAt });
    return rawToken;
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

export async function findUserBySession(db: ReturnType<typeof drizzle>, rawSession: string) {
    const sessionId = await hashToken(rawSession);
    const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    const user = await db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!user || user.isSuspended) return null;
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, sessionId));
    return user;
}

export function sessionCookie(value: string, expiresAt: Date, secure: boolean): string {
    return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor((expiresAt.getTime() - Date.now()) / 1000)}${secure ? '; Secure' : ''}`;
}

export function expiredSessionCookie(secure: boolean): string {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
