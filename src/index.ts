import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, like, or, type SQL } from 'drizzle-orm';
import {
    accessRequests,
    children,
    householdFavorites,
    households,
    magicLinkRateLimits,
    magicTokens,
    residents,
    sessions,
    users,
} from './db/schema';
import { createMagicLinkToken, createSession, expiredSessionCookie, findUserBySession, hashToken, normalizeEmail, sessionCookie, SESSION_COOKIE } from './lib/auth';
import { sendMagicLinkEmail } from './lib/email';
import { getCookie, requireAdmin, requireAuth } from './middleware/auth';

type Bindings = {
    DB: D1Database;
    BUCKET: R2Bucket;
    DEV_BYPASS_AUTH?: string;
    JWT_SECRET?: string;
    EMAIL: {
        send(message: Record<string, unknown>): Promise<unknown>;
    };
};

const app = new Hono<{ Bindings: Bindings }>();

function compareStreetAddresses(left: string, right: string): number {
    const leftMatch = left.trim().match(/^(\d+)\s+(.+)$/);
    const rightMatch = right.trim().match(/^(\d+)\s+(.+)$/);

    if (!leftMatch || !rightMatch) return left.localeCompare(right, undefined, { sensitivity: 'base' });

    const streetNameOrder = leftMatch[2]!.localeCompare(rightMatch[2]!, undefined, { sensitivity: 'base' });
    return streetNameOrder || Number(leftMatch[1]) - Number(rightMatch[1]);
}

app.get('/api/health', (c) => c.json({ status: 'ok', runtime: 'bun-cloudflare' }));

app.post('/api/auth/request-link', async (c) => {
    const db = drizzle(c.env.DB);
    const body = await c.req.json<{ email?: string }>();
    const email = normalizeEmail(body.email ?? '');
    if (!email || !email.includes('@')) return c.json({ error: 'Enter a valid email address.' }, 400);

    const now = new Date();
    const existingLimit = await db.select().from(magicLinkRateLimits).where(eq(magicLinkRateLimits.email, email)).get();
    const minuteElapsed = existingLimit ? now.getTime() - existingLimit.minuteStartedAt.getTime() : Number.POSITIVE_INFINITY;
    const sameDay = existingLimit && now.getTime() - existingLimit.dailyStartedAt.getTime() < 24 * 60 * 60_000;

    if (minuteElapsed < 60_000) return c.json({ error: 'Please wait one minute before requesting another link.' }, 429);
    if (sameDay && existingLimit.dailyCount >= 10) return c.json({ error: 'Daily sign-in link limit reached. Please try again tomorrow.' }, 429);

    const dailyCount = sameDay ? existingLimit.dailyCount + 1 : 1;
    await db.insert(magicLinkRateLimits).values({
        email,
        minuteStartedAt: now,
        dailyStartedAt: sameDay ? existingLimit.dailyStartedAt : now,
        dailyCount,
    }).onConflictDoUpdate({
        target: magicLinkRateLimits.email,
        set: { minuteStartedAt: now, dailyStartedAt: sameDay ? existingLimit.dailyStartedAt : now, dailyCount },
    });

    const token = await createMagicLinkToken(db, email);
    try {
        await sendMagicLinkEmail(c.env.EMAIL, email, token, new URL(c.req.url).origin);
    } catch (error) {
        const emailError = error as { code?: string; message?: string };
        console.error('Magic-link email failed', {
            code: emailError.code ?? 'UNKNOWN',
            message: emailError.message ?? 'Unknown email provider error',
            recipientDomain: email.split('@')[1] ?? 'unknown',
        });
        return c.json({ error: 'We could not send the email right now. Please try again later.' }, 503);
    }

    return c.json({ message: 'If that email can access the directory, a sign-in link is on its way.' });
});

app.get('/api/auth/verify', async (c) => {
    const db = drizzle(c.env.DB);
    const rawToken = c.req.query('token');
    if (!rawToken) return c.json({ error: 'Missing sign-in token.' }, 400);

    const token = await db.select().from(magicTokens).where(eq(magicTokens.token, await hashToken(rawToken))).get();
    if (!token || token.expiresAt.getTime() <= Date.now()) return c.json({ error: 'This sign-in link is invalid or expired.' }, 400);
    await db.delete(magicTokens).where(eq(magicTokens.id, token.id));

    const email = normalizeEmail(token.email);
    let user = await db.select().from(users).where(eq(users.email, email)).get();
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

    const { rawSession, expiresAt } = await createSession(db, user.id);
    const secure = new URL(c.req.url).protocol === 'https:';
    const response = c.json({ matched: Boolean(user.residentId), userId: user.id });
    response.headers.set('Set-Cookie', sessionCookie(rawSession, expiresAt, secure));
    return response;
});

app.get('/api/auth/me', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { id: number; email: string; residentId?: number | null };
    const resident = user.residentId
        ? await db.select({ firstName: residents.firstName, lastName: residents.lastName })
            .from(residents).where(eq(residents.id, user.residentId)).get()
        : await db.select({ firstName: residents.firstName, lastName: residents.lastName })
            .from(residents).where(eq(residents.email, user.email)).get();
    const displayName = resident ? `${resident.firstName} ${resident.lastName}` : user.email;
    return c.json({
        user: { ...user, displayName },
        matched: Boolean(user.residentId || resident),
    });
});

app.post('/api/auth/logout', async (c) => {
    const rawSession = getCookie(c.req.raw, SESSION_COOKIE);
    if (rawSession) {
        const db = drizzle(c.env.DB);
        await db.delete(sessions).where(eq(sessions.id, await hashToken(rawSession)));
    }
    const response = c.json({ success: true });
    response.headers.set('Set-Cookie', expiredSessionCookie(new URL(c.req.url).protocol === 'https:'));
    return response;
});

app.post('/api/access-requests', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { id: number; email: string };
    const body = await c.req.json<{ fullName?: string; streetAddress?: string }>();
    const fullName = body.fullName?.trim() ?? '';
    const streetAddress = body.streetAddress?.trim() ?? '';
    if (!fullName || !streetAddress) return c.json({ error: 'Name and street address are required.' }, 400);

    const pending = await db.select({ id: accessRequests.id }).from(accessRequests)
        .where(and(eq(accessRequests.email, user.email), eq(accessRequests.status, 'pending'))).get();
    if (!pending) {
        await db.insert(accessRequests).values({ email: user.email, fullName, streetAddress });
    }
    return c.json({ status: 'pending' });
});

app.get('/api/admin/access-requests', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    return c.json(await db.select().from(accessRequests).orderBy(accessRequests.createdAt).all());
});

app.get('/api/admin/residents', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const q = c.req.query('q')?.trim().toLowerCase();
    const data = await db.select().from(residents).all();
    const filtered = q
        ? data.filter((resident) => `${resident.firstName} ${resident.lastName} ${resident.email ?? ''}`.toLowerCase().includes(q))
        : data;
    return c.json(filtered);
});

app.patch('/api/admin/access-requests/:requestId', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const requestId = Number(c.req.param('requestId'));
    const body = await c.req.json<{ status?: 'approved' | 'rejected'; residentId?: number; notes?: string }>();
    const admin = c.get('user') as { id: number };
    if (!Number.isInteger(requestId) || !['approved', 'rejected'].includes(body.status ?? '')) {
        return c.json({ error: 'Invalid access request update.' }, 400);
    }
    if (body.status === 'approved' && !Number.isInteger(body.residentId)) {
        return c.json({ error: 'A resident must be selected for approval.' }, 400);
    }

    const request = await db.select().from(accessRequests).where(eq(accessRequests.id, requestId)).get();
    if (!request) return c.json({ error: 'Access request not found.' }, 404);

    if (body.status === 'approved') {
        await db.update(users).set({ residentId: body.residentId, linkStatus: 'admin_linked', updatedAt: new Date() }).where(eq(users.email, request.email));
    }
    await db.update(accessRequests).set({
        status: body.status,
        reviewedByUserId: admin.id,
        reviewedAt: new Date(),
        notes: body.notes ?? null,
    }).where(eq(accessRequests.id, requestId));
    return c.json({ success: true });
});

app.post('/api/households/:householdId/favorite', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const userId = (c.get('user') as { id: number }).id;
    const householdId = Number(c.req.param('householdId'));

    if (!Number.isInteger(householdId)) return c.json({ error: 'Invalid household ID' }, 400);

    const household = await db.select({ id: households.id }).from(households).where(eq(households.id, householdId)).get();
    if (!household) return c.json({ error: 'Household not found' }, 404);

    await db.insert(householdFavorites).values({ userId, householdId }).onConflictDoNothing();
    return c.json({ favorited: true });
});

app.delete('/api/households/:householdId/favorite', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const userId = (c.get('user') as { id: number }).id;
    const householdId = Number(c.req.param('householdId'));

    if (!Number.isInteger(householdId)) return c.json({ error: 'Invalid household ID' }, 400);

    const favoriteFilter = and(eq(householdFavorites.userId, userId), eq(householdFavorites.householdId, householdId));
    if (favoriteFilter) await db.delete(householdFavorites).where(favoriteFilter);
    return c.json({ favorited: false });
});

app.get('/api/residents', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const data = await db.select().from(residents).all();
    return c.json(data);
});

app.get('/api/directory', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const q = c.req.query('q')?.trim();
    const petSitting = c.req.query('petSitting') === 'true';
    const babysitting = c.req.query('babysitting') === 'true';
    const favoritesOnly = c.req.query('favorites') === 'true';
    const userId = (c.get('user') as { id: number }).id;

    const filters: SQL[] = [];
    if (q) {
        const searchFilter = or(
            like(households.streetAddress, `%${q}%`),
            like(residents.firstName, `%${q}%`),
            like(residents.lastName, `%${q}%`),
            like(residents.email, `%${q}%`),
            like(children.name, `%${q}%`)
        );
        if (searchFilter) filters.push(searchFilter);
    }

    const serviceFilters: SQL[] = [];
    if (petSitting) serviceFilters.push(eq(children.petSitting, true));
    if (babysitting) serviceFilters.push(eq(children.babysitting, true));
    if (serviceFilters.length) {
        const serviceFilter = or(...serviceFilters);
        if (serviceFilter) filters.push(serviceFilter);
    }

    // Households matching the search term directly, or via a resident/child match.
    const combinedFilter = filters.length ? and(...filters) : undefined;
    const matchedHouseholdIds = combinedFilter
        ? new Set(
            (
                await db
                    .select({ id: households.id })
                    .from(households)
                    .leftJoin(residents, eq(residents.householdId, households.id))
                    .leftJoin(children, eq(children.householdId, households.id))
                    .where(combinedFilter)
                    .all()
            ).map((row) => row.id)
        )
        : null;

    const favoriteHouseholdIds = new Set(
        (await db.select({ householdId: householdFavorites.householdId })
            .from(householdFavorites)
            .where(eq(householdFavorites.userId, userId))
            .all()).map((row) => row.householdId)
    );

    const householdRows = (await db.select().from(households).all()).sort((left, right) =>
        compareStreetAddresses(left.streetAddress, right.streetAddress)
    );
    const filteredHouseholds = matchedHouseholdIds
        ? householdRows.filter((h) => matchedHouseholdIds.has(h.id))
        : householdRows;
    const visibleHouseholds = filteredHouseholds.filter((household) =>
        !favoritesOnly || favoriteHouseholdIds.has(household.id)
    );

    const [allResidents, allChildren] = await Promise.all([
        db.select().from(residents).all(),
        db.select().from(children).all(),
    ]);

    const data = visibleHouseholds.map((household) => ({
        ...household,
        isFavorite: favoriteHouseholdIds.has(household.id),
        residents: allResidents.filter((r) => r.householdId === household.id),
        children: allChildren.filter((ch) => ch.householdId === household.id),
    }));

    return c.json(data);
});

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;