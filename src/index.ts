import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, desc, eq, inArray, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { alias } from 'drizzle-orm/sqlite-core';
import {
    accessRequests,
    activityLogs,
    children,
    documentFolders,
    documents,
    householdFavorites,
    householdArchive,
    households,
    magicLinkRateLimits,
    magicTokens,
    menus,
    pages,
    photoEvents,
    photoFolders,
    photos,
    residents,
    sessions,
    userLoginEmails,
    users,
} from './db/schema';
import { approvalLinkLifetimeMinutes, completeLogin, createMagicLinkToken, expiredSessionCookie, findUserBySession, hashToken, normalizeEmail, sessionCookie, SESSION_COOKIE, verifyCodeAndConsume } from './lib/auth';
import { sendAccessRequestAdminNotificationEmail, sendAccessRequestOutcomeEmail, sendMagicLinkEmail } from './lib/email';
import { getSetting, setSetting } from './lib/settings';

const DEFAULT_ADMIN_EMAIL = 'admin@parkhillfw.com';
const DEFAULT_SITE_NAME = 'Park Hill Directory';
import { devBypassUser, getCookie, isOwner as hasOwner, requireAdmin, requireAnyAdminRole, requireAuth, requireDirectory, requireDirectoryEditor, requireFinance, requirePageEditor, type AppBindings, type AppEnv } from './middleware/auth';

const app = new Hono<AppEnv>();

function compareStreetAddresses(left: string, right: string): number {
    const leftMatch = left.trim().match(/^(\d+)\s+(.+)$/);
    const rightMatch = right.trim().match(/^(\d+)\s+(.+)$/);

    if (!leftMatch || !rightMatch) return left.localeCompare(right, undefined, { sensitivity: 'base' });

    const streetNameOrder = leftMatch[2]!.localeCompare(rightMatch[2]!, undefined, { sensitivity: 'base' });
    return streetNameOrder || Number(leftMatch[1]) - Number(rightMatch[1]);
}

app.get('/api/health', (c) => c.json({ status: 'ok', runtime: 'bun-cloudflare' }));

// Public, unauthenticated: the site name is used in the navbar and login screen before sign-in.
app.get('/api/settings', async (c) => {
    const db = drizzle(c.env.DB);
    const siteName = await getSetting(db, 'site_name', DEFAULT_SITE_NAME);
    return c.json({ siteName });
});

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

    // Don't reveal account existence/status via a different response — suspended accounts silently get no email.
    const existingUser = await db.select({ id: users.id, isSuspended: users.isSuspended }).from(users).where(eq(users.email, email)).get();
    const existingAlias = existingUser ? null : await db.select({ userId: userLoginEmails.userId }).from(userLoginEmails).where(eq(userLoginEmails.email, email)).get();
    const aliasUser = existingAlias ? await db.select({ isSuspended: users.isSuspended }).from(users).where(eq(users.id, existingAlias.userId)).get() : null;
    if (existingUser?.isSuspended || aliasUser?.isSuspended) {
        return c.json({ message: 'A sign-in link and code are on their way.' });
    }

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
        const [adminEmail, siteName] = await Promise.all([
            getSetting(db, 'admin_email', DEFAULT_ADMIN_EMAIL),
            getSetting(db, 'site_name', DEFAULT_SITE_NAME),
        ]);
        await sendMagicLinkEmail(c.env.EMAIL, email, token.rawToken, token.rawCode, new URL(c.req.url).origin, adminEmail, siteName);
    } catch (error) {
        const emailError = error as { code?: string; message?: string };
        console.error('Magic-link email failed', {
            code: emailError.code ?? 'UNKNOWN',
            message: emailError.message ?? 'Unknown email provider error',
            recipientDomain: email.split('@')[1] ?? 'unknown',
        });
        return c.json({ error: 'We could not send the email right now. Please try again later.' }, 503);
    }

    return c.json({ message: 'A sign-in link and code are on their way.' });
});

app.post('/api/auth/verify-code', async (c) => {
    const db = drizzle(c.env.DB);
    const body = await c.req.json<{ email?: string; code?: string }>();
    const email = normalizeEmail(body.email ?? '');
    const code = (body.code ?? '').trim();
    if (!email || !email.includes('@')) return c.json({ error: 'Enter a valid email address.' }, 400);
    if (!/^\d{6}$/.test(code)) return c.json({ error: 'Enter the 6-digit code from your email.' }, 400);

    const codeResult = await verifyCodeAndConsume(db, email, code);
    if (!codeResult.ok) return c.json({ error: codeResult.error }, 400);

    const loginResult = await completeLogin(db, email, {
        userAgent: c.req.header('User-Agent'),
        ipAddress: c.req.header('CF-Connecting-IP'),
    });
    if (!loginResult.ok) return c.json({ error: loginResult.error }, loginResult.status);

    const secure = new URL(c.req.url).protocol === 'https:';
    const response = c.json({ matched: Boolean(loginResult.user.residentId), userId: loginResult.user.id });
    response.headers.set('Set-Cookie', sessionCookie(loginResult.rawSession, loginResult.expiresAt, secure));
    return response;
});

app.get('/api/auth/verify', async (c) => {
    const db = drizzle(c.env.DB);
    const rawToken = c.req.query('token');
    if (!rawToken) return c.json({ error: 'Missing sign-in token.' }, 400);

    const token = await db.select().from(magicTokens).where(eq(magicTokens.token, await hashToken(rawToken))).get();
    if (!token || token.expiresAt.getTime() <= Date.now()) return c.json({ error: 'This sign-in link is invalid or expired.' }, 400);
    await db.delete(magicTokens).where(eq(magicTokens.id, token.id));

    const loginResult = await completeLogin(db, token.email, {
        userAgent: c.req.header('User-Agent'),
        ipAddress: c.req.header('CF-Connecting-IP'),
    });
    if (!loginResult.ok) return c.json({ error: loginResult.error }, loginResult.status);

    const secure = new URL(c.req.url).protocol === 'https:';
    const response = c.json({ matched: Boolean(loginResult.user.residentId), userId: loginResult.user.id });
    response.headers.set('Set-Cookie', sessionCookie(loginResult.rawSession, loginResult.expiresAt, secure));
    return response;
});

app.get('/api/auth/me', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { id: number; email: string; residentId?: number | null; householdId?: number };
    const previousLastSeenAt = c.get('previousLastSeenAt');
    const resident = user.residentId
        ? await db.select({ id: residents.id, householdId: residents.householdId, firstName: residents.firstName, lastName: residents.lastName })
            .from(residents).where(eq(residents.id, user.residentId)).get()
        : user.householdId
            ? await db.select({ id: residents.id, householdId: residents.householdId, firstName: residents.firstName, lastName: residents.lastName })
                .from(residents).where(eq(residents.householdId, user.householdId)).get()
            : await db.select({ id: residents.id, householdId: residents.householdId, firstName: residents.firstName, lastName: residents.lastName })
                .from(residents).where(eq(residents.email, user.email)).get();
    const displayName = resident ? `${resident.firstName} ${resident.lastName}` : user.email;

    let needsDirectoryReview = false;
    const householdId = resident?.householdId ?? user.householdId;
    if (householdId) {
        const household = await db.select({
            updatedAt: households.updatedAt,
            directoryConfirmedAt: households.directoryConfirmedAt,
        }).from(households).where(eq(households.id, householdId)).get();

        if (household) {
            const SIX_MONTHS_MS = 180 * 24 * 60 * 60_000;
            const lastTouchTime = Math.max(
                household.updatedAt ? new Date(household.updatedAt).getTime() : 0,
                household.directoryConfirmedAt ? new Date(household.directoryConfirmedAt).getTime() : 0
            );
            // If never updated/confirmed or older than 6 months (180 days)
            if (lastTouchTime === 0 || Date.now() - lastTouchTime > SIX_MONTHS_MS) {
                needsDirectoryReview = true;
            }
        }
    }

    return c.json({
        user: {
            ...user,
            displayName,
            lastActiveAt: previousLastSeenAt ? new Date(previousLastSeenAt).toISOString() : null,
            needsDirectoryReview,
        },
        matched: Boolean(user.residentId || resident),
    });
});

app.get('/api/account/login-emails', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { id: number; residentId?: number | null };
    const accountUsers = user.residentId
        ? await db.select({ id: users.id }).from(users).where(eq(users.residentId, user.residentId)).all()
        : [{ id: user.id }];
    const loginEmails = await db.select({ email: userLoginEmails.email })
        .from(userLoginEmails).where(inArray(userLoginEmails.userId, accountUsers.map((item) => item.id))).all();
    return c.json({ emails: loginEmails.map((item) => item.email) });
});

app.put('/api/account/login-emails', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { id: number; email: string; residentId?: number | null };
    const canonicalUser = user.residentId
        ? await db.select().from(users).where(eq(users.residentId, user.residentId)).orderBy(asc(users.id)).get()
        : await db.select().from(users).where(eq(users.id, user.id)).get();
    if (!canonicalUser) return c.json({ error: 'User account not found.' }, 404);
    const body = await c.req.json<{ emails?: string[] }>();
    if (!Array.isArray(body.emails)) return c.json({ error: 'Invalid Login Email update.' }, 400);

    const emails = [...new Set(body.emails.map(normalizeEmail).filter((email) => email && email.includes('@')))]
        .filter((email) => email !== normalizeEmail(canonicalUser.email));
    for (const email of emails) {
        const primaryOwner = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
        const alternateOwner = await db.select({ userId: userLoginEmails.userId }).from(userLoginEmails)
            .where(eq(userLoginEmails.email, email)).get();
        if ((primaryOwner && primaryOwner.id !== canonicalUser.id) || (alternateOwner && alternateOwner.userId !== canonicalUser.id)) {
            return c.json({ error: `Login Email ${email} is already assigned to another user.` }, 409);
        }
    }

    const existing = await db.select().from(userLoginEmails).where(eq(userLoginEmails.userId, canonicalUser.id)).all();
    const keep = new Set(emails);
    for (const item of existing) {
        if (!keep.has(item.email)) await db.delete(userLoginEmails).where(eq(userLoginEmails.id, item.id));
    }
    for (const email of emails) {
        await db.insert(userLoginEmails).values({ userId: canonicalUser.id, email }).onConflictDoNothing();
    }
    return c.json({ emails });
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
        try {
            const [adminEmail, siteName] = await Promise.all([
                getSetting(db, 'admin_email', DEFAULT_ADMIN_EMAIL),
                getSetting(db, 'site_name', DEFAULT_SITE_NAME),
            ]);
            await sendAccessRequestAdminNotificationEmail(c.env.EMAIL, adminEmail, user.email, fullName, streetAddress, new URL(c.req.url).origin, siteName);
        } catch (error) {
            const emailError = error as { code?: string; message?: string };
            console.error('Access request admin notification email failed', { code: emailError.code ?? 'UNKNOWN', message: emailError.message ?? 'Unknown email provider error' });
        }
    }
    return c.json({ status: 'pending' });
});

app.get('/api/my-directory', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { email: string; residentId?: number | null; householdId?: number };
    const resident = user.residentId
        ? await db.select().from(residents).where(eq(residents.id, user.residentId)).get()
        : user.householdId
            ? await db.select().from(residents).where(eq(residents.householdId, user.householdId)).get()
            : await db.select().from(residents).where(eq(residents.email, user.email)).get();
    if (!resident) return c.json({ error: 'Your account is not linked to a directory household.' }, 403);

    const household = await db.select().from(households).where(eq(households.id, resident.householdId)).get();
    if (!household) return c.json({ error: 'Directory household not found.' }, 404);
    const [householdResidents, householdChildren] = await Promise.all([
        db.select().from(residents).where(eq(residents.householdId, household.id)).all(),
        db.select().from(children).where(eq(children.householdId, household.id)).all(),
    ]);
    return c.json({ household, residents: householdResidents, children: householdChildren });
});

app.put('/api/my-directory', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { email: string; residentId?: number | null; householdId?: number };
    const linkedResident = user.residentId
        ? await db.select().from(residents).where(eq(residents.id, user.residentId)).get()
        : user.householdId
            ? await db.select().from(residents).where(eq(residents.householdId, user.householdId)).get()
            : await db.select().from(residents).where(eq(residents.email, user.email)).get();
    if (!linkedResident) return c.json({ error: 'Your account is not linked to a directory household.' }, 403);

    const body = await c.req.json<{
        household?: { streetAddress?: string; yearMovedIn?: number | null; parkHillMember?: string | null; securityMember?: boolean; pets?: string | null; notes?: string | null };
        residents?: Array<{ id?: number; firstName: string; lastName: string; isPrimaryContact?: boolean; email?: string | null; phoneMobile?: string | null; phoneHome?: string | null; phoneWork?: string | null; occupation?: string | null }>;
        children?: Array<{ id?: number; name: string; birthYear?: number | null; school?: string | null; occupation?: string | null; residenceLocation?: string | null; babysitting?: boolean; petSitting?: boolean; specialSkills?: string | null }>;
    }>();
    const householdId = linkedResident.householdId;
    const household = body.household;
    if (!household?.streetAddress?.trim()) return c.json({ error: 'Street address is required.' }, 400);
    const currentHousehold = await db.select({ streetAddress: households.streetAddress })
        .from(households).where(eq(households.id, householdId)).get();
    if (!currentHousehold) return c.json({ error: 'Directory household not found.' }, 404);
    if (household.streetAddress.trim() !== currentHousehold.streetAddress) {
        return c.json({ error: 'Only an administrator can change the street address.' }, 403);
    }

    const currentResidents = await db.select({ id: residents.id }).from(residents).where(eq(residents.householdId, householdId)).all();
    const residentIds = new Set(currentResidents.map((item) => item.id));
    const submittedResidentIds = (body.residents ?? []).filter((item) => item.id !== undefined).map((item) => item.id as number);
    if (!submittedResidentIds.includes(linkedResident.id)) return c.json({ error: 'Your own resident record must remain in the household.' }, 400);
    if (submittedResidentIds.some((id) => !residentIds.has(id))) return c.json({ error: 'Invalid household resident.' }, 400);

    const currentChildren = await db.select({ id: children.id }).from(children).where(eq(children.householdId, householdId)).all();
    const childIds = new Set(currentChildren.map((item) => item.id));
    const submittedChildIds = (body.children ?? []).filter((item) => item.id !== undefined).map((item) => item.id as number);
    if (submittedChildIds.some((id) => !childIds.has(id))) return c.json({ error: 'Invalid household child.' }, 400);

    await db.update(households).set({
        streetAddress: currentHousehold.streetAddress,
        yearMovedIn: household.yearMovedIn ?? null,
        parkHillMember: household.parkHillMember?.trim() || null,
        securityMember: Boolean(household.securityMember),
        pets: household.pets?.trim() || null,
        notes: household.notes?.trim() || null,
        updatedAt: new Date(),
    }).where(eq(households.id, householdId));

    for (const item of body.residents ?? []) {
        const values = {
            firstName: item.firstName.trim(),
            lastName: item.lastName.trim(),
            isPrimaryContact: Boolean(item.isPrimaryContact),
            email: item.email?.trim() || null,
            phoneMobile: item.phoneMobile?.trim() || null,
            phoneHome: item.phoneHome?.trim() || null,
            phoneWork: item.phoneWork?.trim() || null,
            occupation: item.occupation?.trim() || null,
        };
        if (item.id) await db.update(residents).set(values).where(eq(residents.id, item.id));
        else await db.insert(residents).values({ ...values, householdId });
    }
    for (const id of currentResidents.map((item) => item.id).filter((id) => !submittedResidentIds.includes(id))) {
        await db.delete(residents).where(eq(residents.id, id));
    }

    for (const item of body.children ?? []) {
        const values = {
            name: item.name.trim(),
            birthYear: item.birthYear ?? null,
            school: item.school?.trim() || null,
            occupation: item.occupation?.trim() || null,
            residenceLocation: item.residenceLocation?.trim() || null,
            babysitting: Boolean(item.babysitting),
            petSitting: Boolean(item.petSitting),
            specialSkills: item.specialSkills?.trim() || null,
        };
        if (item.id) await db.update(children).set(values).where(eq(children.id, item.id));
        else await db.insert(children).values({ ...values, householdId });
    }
    for (const id of currentChildren.map((item) => item.id).filter((id) => !submittedChildIds.includes(id))) {
        await db.delete(children).where(eq(children.id, id));
    }

    return c.json({ saved: true });
});

app.post('/api/my-directory/confirm', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { email: string; residentId?: number | null; householdId?: number };
    const linkedResident = user.residentId
        ? await db.select().from(residents).where(eq(residents.id, user.residentId)).get()
        : user.householdId
            ? await db.select().from(residents).where(eq(residents.householdId, user.householdId)).get()
            : await db.select().from(residents).where(eq(residents.email, user.email)).get();
    if (!linkedResident) return c.json({ error: 'Your account is not linked to a directory household.' }, 403);

    const now = new Date();
    await db.update(households).set({
        directoryConfirmedAt: now,
    }).where(eq(households.id, linkedResident.householdId));

    return c.json({ ok: true, confirmedAt: now.toISOString() });
});

app.get('/api/admin/access-requests', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    return c.json(await db.select().from(accessRequests).orderBy(accessRequests.createdAt).all());
});

app.get('/api/admin/access-requests/count', requireAuth(), requireAnyAdminRole(), async (c) => {
    const db = drizzle(c.env.DB);
    const pending = await db.select({ id: accessRequests.id }).from(accessRequests)
        .where(eq(accessRequests.status, 'pending')).all();
    return c.json({ count: pending.length });
});

app.get('/api/admin/status', requireAuth(), requireAnyAdminRole(), async (c) => {
    const db = drizzle(c.env.DB);
    const sixMonthsAgoSec = Math.floor((Date.now() - 180 * 24 * 60 * 60_000) / 1000);
    const nowSec = Math.floor(Date.now() / 1000);
    const dayAgoSec = nowSec - 24 * 60 * 60;
    const weekAgoSec = nowSec - 7 * 24 * 60 * 60;
    const monthAgoSec = nowSec - 30 * 24 * 60 * 60;
    const quarterAgoSec = nowSec - 90 * 24 * 60 * 60;
    const [householdCount, residentCount, childCount, userCount, aliasLoginCount, openAccessRequestCount, verifiedHouseholdCount, activeUserCounts] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(households).get(),
        db.select({ count: sql<number>`count(*)` }).from(residents).get(),
        db.select({ count: sql<number>`count(*)` }).from(children).get(),
        db.select({ count: sql<number>`count(*)` }).from(users).get(),
        db.select({ count: sql<number>`count(*)` }).from(userLoginEmails).get(),
        db.select({ count: sql<number>`count(*)` }).from(accessRequests).where(eq(accessRequests.status, 'pending')).get(),
        db.select({ count: sql<number>`count(*)` }).from(households).where(
            sql`max(coalesce(${households.updatedAt}, 0), coalesce(${households.directoryConfirmedAt}, 0)) >= ${sixMonthsAgoSec}`
        ).get(),
        db.select({
            dau: sql<number>`count(distinct case when ${sessions.lastSeenAt} >= ${dayAgoSec} then ${sessions.userId} end)`,
            wau: sql<number>`count(distinct case when ${sessions.lastSeenAt} >= ${weekAgoSec} then ${sessions.userId} end)`,
            mau: sql<number>`count(distinct case when ${sessions.lastSeenAt} >= ${monthAgoSec} then ${sessions.userId} end)`,
            qau: sql<number>`count(distinct case when ${sessions.lastSeenAt} >= ${quarterAgoSec} then ${sessions.userId} end)`,
        }).from(sessions).where(sql`${sessions.lastSeenAt} >= ${quarterAgoSec}`).get(),
    ]);

    return c.json({
        households: householdCount?.count ?? 0,
        verifiedHouseholds: verifiedHouseholdCount?.count ?? 0,
        adultResidents: residentCount?.count ?? 0,
        children: childCount?.count ?? 0,
        loginAccounts: userCount?.count ?? 0,
        aliasLogins: aliasLoginCount?.count ?? 0,
        openAccessRequests: openAccessRequestCount?.count ?? 0,
        dau: activeUserCounts?.dau ?? 0,
        wau: activeUserCounts?.wau ?? 0,
        mau: activeUserCounts?.mau ?? 0,
        qau: activeUserCounts?.qau ?? 0,
    });
});

app.get('/api/admin/settings', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const [adminEmail, siteName] = await Promise.all([
        getSetting(db, 'admin_email', DEFAULT_ADMIN_EMAIL),
        getSetting(db, 'site_name', DEFAULT_SITE_NAME),
    ]);
    return c.json({ adminEmail, siteName });
});

app.put('/api/admin/settings', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const actor = c.get('user') as { id: number };
    const body = await c.req.json<{ adminEmail?: string; siteName?: string }>();

    if (body.adminEmail !== undefined) {
        const adminEmail = body.adminEmail.trim();
        if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
            return c.json({ error: 'Enter a valid admin email address.' }, 400);
        }
        await setSetting(db, 'admin_email', adminEmail, actor.id);
    }

    if (body.siteName !== undefined) {
        const siteName = body.siteName.trim();
        if (!siteName) return c.json({ error: 'Enter a site name.' }, 400);
        await setSetting(db, 'site_name', siteName, actor.id);
    }

    const [adminEmail, siteName] = await Promise.all([
        getSetting(db, 'admin_email', DEFAULT_ADMIN_EMAIL),
        getSetting(db, 'site_name', DEFAULT_SITE_NAME),
    ]);
    return c.json({ adminEmail, siteName });
});

// Placeholder for the Finance subsystem; Payment Processor is not implemented yet.
app.get('/api/admin/finance/payment-processor', requireAuth(), requireFinance(), async (c) => {
    return c.json({ comingSoon: true });
});

app.get('/api/admin/residents', requireAuth(), requireDirectoryEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const q = c.req.query('q')?.trim().toLowerCase();
    const data = await db.select().from(residents).all();
    const filtered = q
        ? data.filter((resident) => `${resident.firstName} ${resident.lastName} ${resident.email ?? ''}`.toLowerCase().includes(q))
        : data;
    return c.json(filtered);
});

app.get('/api/admin/directory', requireAuth(), requireDirectoryEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const q = c.req.query('q')?.trim();
    const householdsQuery = q
        ? db.select({ id: households.id, streetAddress: households.streetAddress })
            .from(households)
            .leftJoin(residents, eq(residents.householdId, households.id))
            .where(or(
                like(households.streetAddress, `%${q}%`),
                like(residents.firstName, `%${q}%`),
                like(residents.lastName, `%${q}%`),
                like(residents.email, `%${q}%`),
            )).all()
        : db.select({ id: households.id, streetAddress: households.streetAddress }).from(households).all();
    const matches = await householdsQuery;
    const uniqueMatches = [...new Map(matches.map((item) => [item.id, item])).values()];
    const results = await Promise.all(uniqueMatches.map(async (household) => ({
        ...household,
        residents: await db.select({ id: residents.id, firstName: residents.firstName, lastName: residents.lastName, email: residents.email })
            .from(residents).where(eq(residents.householdId, household.id)).all(),
    })));
    return c.json(results);
});

app.get('/api/admin/households', requireAuth(), requireDirectoryEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const q = c.req.query('q')?.trim();
    const householdRows = q
        ? await db.select({ id: households.id, streetAddress: households.streetAddress, status: households.status })
            .from(households)
            .leftJoin(residents, eq(residents.householdId, households.id))
            .where(or(
                like(households.streetAddress, `%${q}%`),
                like(residents.firstName, `%${q}%`),
                like(residents.lastName, `%${q}%`),
                like(residents.email, `%${q}%`),
            )).all()
        : await db.select({ id: households.id, streetAddress: households.streetAddress, status: households.status }).from(households).all();
    const uniqueHouseholds = [...new Map(householdRows.map((item) => [item.id, item])).values()];
    return c.json(await Promise.all(uniqueHouseholds.map(async (household) => ({
        ...household,
        residents: await db.select({ id: residents.id, firstName: residents.firstName, lastName: residents.lastName, email: residents.email })
            .from(residents).where(eq(residents.householdId, household.id)).all(),
        children: await db.select({ id: children.id, name: children.name }).from(children)
            .where(eq(children.householdId, household.id)).all(),
    }))));
});

app.post('/api/admin/households', requireAuth(), requireDirectoryEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const body = await c.req.json<{ streetAddress?: string }>();
    const streetAddress = body.streetAddress?.trim() ?? '';
    if (!streetAddress) return c.json({ error: 'Street address is required.' }, 400);
    const existing = await db.select({ id: households.id }).from(households)
        .where(eq(households.streetAddress, streetAddress)).get();
    if (existing) return c.json({ error: 'A household already exists at this address.' }, 409);
    const created = await db.insert(households).values({ streetAddress, status: 'vacant' }).returning({ id: households.id, streetAddress: households.streetAddress });
    return c.json({ household: created[0] }, 201);
});

app.get('/api/admin/households/:householdId', requireAuth(), requireDirectoryEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const householdId = Number(c.req.param('householdId'));
    if (!Number.isInteger(householdId)) return c.json({ error: 'Invalid household ID.' }, 400);
    const household = await db.select().from(households).where(eq(households.id, householdId)).get();
    if (!household) return c.json({ error: 'Household not found.' }, 404);
    const [householdResidents, householdChildren] = await Promise.all([
        db.select().from(residents).where(eq(residents.householdId, householdId)).all(),
        db.select().from(children).where(eq(children.householdId, householdId)).all(),
    ]);
    return c.json({ household, residents: householdResidents, children: householdChildren });
});

app.put('/api/admin/households/:householdId', requireAuth(), requireDirectoryEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const householdId = Number(c.req.param('householdId'));
    if (!Number.isInteger(householdId)) return c.json({ error: 'Invalid household ID.' }, 400);
    const existingHousehold = await db.select({ id: households.id }).from(households).where(eq(households.id, householdId)).get();
    if (!existingHousehold) return c.json({ error: 'Household not found.' }, 404);
    const body = await c.req.json<{
        household?: { streetAddress?: string; yearMovedIn?: number | null; parkHillMember?: string | null; securityMember?: boolean; pets?: string | null; notes?: string | null };
        residents?: Array<{ id?: number; firstName: string; lastName: string; isPrimaryContact?: boolean; email?: string | null; phoneMobile?: string | null; phoneHome?: string | null; phoneWork?: string | null; occupation?: string | null }>;
        children?: Array<{ id?: number; name: string; birthYear?: number | null; school?: string | null; occupation?: string | null; residenceLocation?: string | null; babysitting?: boolean; petSitting?: boolean; specialSkills?: string | null }>;
    }>();
    if (!body.household?.streetAddress?.trim()) return c.json({ error: 'Street address is required.' }, 400);

    const currentResidents = await db.select({ id: residents.id }).from(residents).where(eq(residents.householdId, householdId)).all();
    const currentResidentIds = new Set(currentResidents.map((item) => item.id));
    const submittedResidentIds = (body.residents ?? []).flatMap((item) => item.id ? [item.id] : []);
    if (submittedResidentIds.some((id) => !currentResidentIds.has(id))) return c.json({ error: 'Invalid household resident.' }, 400);
    const currentChildren = await db.select({ id: children.id }).from(children).where(eq(children.householdId, householdId)).all();
    const currentChildIds = new Set(currentChildren.map((item) => item.id));
    const submittedChildIds = (body.children ?? []).flatMap((item) => item.id ? [item.id] : []);
    if (submittedChildIds.some((id) => !currentChildIds.has(id))) return c.json({ error: 'Invalid household child.' }, 400);

    await db.update(households).set({
        streetAddress: body.household.streetAddress.trim(),
        yearMovedIn: body.household.yearMovedIn ?? null,
        parkHillMember: body.household.parkHillMember?.trim() || null,
        securityMember: Boolean(body.household.securityMember),
        pets: body.household.pets?.trim() || null,
        notes: body.household.notes?.trim() || null,
        updatedAt: new Date(),
    }).where(eq(households.id, householdId));

    for (const item of body.residents ?? []) {
        const values = {
            firstName: item.firstName.trim(), lastName: item.lastName.trim(), isPrimaryContact: Boolean(item.isPrimaryContact),
            email: item.email?.trim() || null, phoneMobile: item.phoneMobile?.trim() || null,
            phoneHome: item.phoneHome?.trim() || null, phoneWork: item.phoneWork?.trim() || null, occupation: item.occupation?.trim() || null,
        };
        if (item.id) await db.update(residents).set(values).where(eq(residents.id, item.id));
        else await db.insert(residents).values({ ...values, householdId });
    }
    for (const id of currentResidents.map((item) => item.id).filter((id) => !submittedResidentIds.includes(id))) {
        const affectedUsers = await db.select({ id: users.id }).from(users).where(eq(users.residentId, id)).all();
        const affectedUserIds = affectedUsers.map((item) => item.id);
        if (affectedUserIds.length) {
            await db.delete(sessions).where(inArray(sessions.userId, affectedUserIds));
            await db.delete(userLoginEmails).where(inArray(userLoginEmails.userId, affectedUserIds));
            await db.update(users).set({ residentId: null, linkStatus: 'unlinked', updatedAt: new Date() }).where(inArray(users.id, affectedUserIds));
        }
        await db.delete(residents).where(eq(residents.id, id));
    }

    for (const item of body.children ?? []) {
        const values = {
            name: item.name.trim(), birthYear: item.birthYear ?? null, school: item.school?.trim() || null,
            occupation: item.occupation?.trim() || null, residenceLocation: item.residenceLocation?.trim() || null,
            babysitting: Boolean(item.babysitting), petSitting: Boolean(item.petSitting), specialSkills: item.specialSkills?.trim() || null,
        };
        if (item.id) await db.update(children).set(values).where(eq(children.id, item.id));
        else await db.insert(children).values({ ...values, householdId });
    }
    for (const id of currentChildren.map((item) => item.id).filter((id) => !submittedChildIds.includes(id))) {
        await db.delete(children).where(eq(children.id, id));
    }
    return c.json({ saved: true });
});

app.post('/api/admin/households/:householdId/archive-household', requireAuth(), requireDirectoryEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const householdId = Number(c.req.param('householdId'));
    const actor = c.get('user');
    const body = await c.req.json<{ confirmation?: string }>();
    if (!Number.isInteger(householdId)) return c.json({ error: 'Invalid household ID.' }, 400);

    const household = await db.select().from(households)
        .where(eq(households.id, householdId)).get();
    if (!household) return c.json({ error: 'Household not found.' }, 404);
    if (body.confirmation?.trim() !== household.streetAddress) return c.json({ error: 'Type the exact street address to confirm archiving.' }, 400);

    const [householdResidents, householdChildren] = await Promise.all([
        db.select().from(residents).where(eq(residents.householdId, householdId)).all(),
        db.select().from(children).where(eq(children.householdId, householdId)).all(),
    ]);
    const residentIds = householdResidents.map((resident) => resident.id);
    const residentEmails = householdResidents.flatMap((resident) => resident.email ? [normalizeEmail(resident.email)] : []);
    const linkedUsers = residentIds.length
        ? await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.residentId, residentIds)).all()
        : [];
    const userIds = linkedUsers.map((user) => user.id);
    const linkedLoginEmails = userIds.length
        ? await db.select({ email: userLoginEmails.email }).from(userLoginEmails)
            .where(inArray(userLoginEmails.userId, userIds)).all()
        : [];
    const authEmails = [...new Set([
        ...residentEmails,
        ...linkedUsers.map((user) => normalizeEmail(user.email)),
        ...linkedLoginEmails.map((item) => normalizeEmail(item.email)),
    ])];
    const primaryContact = householdResidents.find((resident) => resident.isPrimaryContact) ?? householdResidents[0] ?? null;
    const now = new Date();
    const snapshot = {
        household: {
            id: household.id,
            streetAddress: household.streetAddress,
            status: household.status,
            yearMovedIn: household.yearMovedIn,
            parkHillMember: household.parkHillMember,
            securityMember: household.securityMember,
            pets: household.pets,
            photoKey: household.photoKey,
            notes: household.notes,
            directoryConfirmedAt: household.directoryConfirmedAt,
        },
        primaryContact,
        residents: householdResidents,
        children: householdChildren,
        archivedBy: actor ? { id: actor.id, email: actor.email } : null,
    };
    const statements: BatchItem<'sqlite'>[] = [
        db.insert(householdArchive).values({
            addressId: household.id,
            archivedAt: now,
            archivedByAdminId: actor?.id ?? null,
            snapshot: JSON.stringify(snapshot),
        }),
        db.insert(activityLogs).values({
            actorUserId: actor?.id ?? null,
            category: 'directory',
            action: 'household_archived',
            details: JSON.stringify({
                householdAddress: household.streetAddress,
                primaryResidentName: primaryContact ? `${primaryContact.firstName} ${primaryContact.lastName}` : null,
                adminUser: actor?.email ?? null,
                timestamp: now.toISOString(),
            }),
        }),
    ];
    if (authEmails.length) statements.push(db.delete(magicTokens).where(inArray(magicTokens.email, authEmails)));
    if (userIds.length) {
        statements.push(
            db.delete(sessions).where(inArray(sessions.userId, userIds)),
            db.delete(userLoginEmails).where(inArray(userLoginEmails.userId, userIds)),
            db.update(users).set({ residentId: null, linkStatus: 'unlinked', updatedAt: now }).where(inArray(users.id, userIds)),
        );
    }
    statements.push(
        db.delete(householdFavorites).where(eq(householdFavorites.householdId, householdId)),
        db.delete(children).where(eq(children.householdId, householdId)),
        db.delete(residents).where(eq(residents.householdId, householdId)),
        db.update(households).set({
            status: 'vacant',
            yearMovedIn: null,
            parkHillMember: null,
            securityMember: false,
            pets: null,
            photoKey: null,
            notes: null,
            directoryConfirmedAt: null,
            updatedAt: now,
        }).where(eq(households.id, householdId)),
    );
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

    return c.json({ archived: true, streetAddress: household.streetAddress, residentsRemoved: residentIds.length, usersReset: userIds.length });
});

app.post('/api/admin/households/:householdId/archive', requireAuth(), requireDirectoryEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const householdId = Number(c.req.param('householdId'));
    const body = await c.req.json<{ confirmation?: string; reason?: string }>();
    if (!Number.isInteger(householdId)) return c.json({ error: 'Invalid household ID.' }, 400);
    const household = await db.select({ id: households.id, streetAddress: households.streetAddress, status: households.status })
        .from(households).where(eq(households.id, householdId)).get();
    if (!household) return c.json({ error: 'Household not found.' }, 404);
    if (household.status !== 'vacant') return c.json({ error: 'Household must be vacant before it can be archived.' }, 409);
    if (body.confirmation?.trim() !== household.streetAddress) return c.json({ error: 'Type the exact street address to confirm archiving.' }, 400);
    await db.update(households).set({ status: 'archived', updatedAt: new Date(), notes: body.reason?.trim() || 'Archived address' })
        .where(eq(households.id, householdId));
    return c.json({ archived: true, streetAddress: household.streetAddress });
});

app.get('/api/admin/users', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const [userRows, alternateRows] = await Promise.all([
        db.select().from(users).all(),
        db.select().from(userLoginEmails).all(),
    ]);
    return c.json(userRows.map((user) => ({
        ...user,
        alternateEmails: alternateRows.filter((item) => item.userId === user.id).map((item) => item.email),
    })));
});

app.put('/api/admin/users/:userId/login-emails', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const actor = c.get('user') as { id: number; isOwner?: boolean };
    const userId = Number(c.req.param('userId'));
    const body = await c.req.json<{ alternateEmails?: string[] }>();
    if (!Number.isInteger(userId) || !Array.isArray(body.alternateEmails)) {
        return c.json({ error: 'Invalid login email update.' }, 400);
    }
    if (await ownerTargetBlocked(db, actor, userId)) return c.json({ error: 'Only an Owner can manage an Owner account.' }, 403);

    const user = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).get();
    if (!user) return c.json({ error: 'User not found.' }, 404);

    const emails = [...new Set(body.alternateEmails.map(normalizeEmail).filter((email) => email && email.includes('@')))]
        .filter((email) => email !== normalizeEmail(user.email));
    const existing = await db.select().from(userLoginEmails).where(eq(userLoginEmails.userId, userId)).all();
    const keep = new Set(emails);
    for (const email of emails) {
        const primaryOwner = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
        const alternateOwner = await db.select({ userId: userLoginEmails.userId }).from(userLoginEmails)
            .where(eq(userLoginEmails.email, email)).get();
        if ((primaryOwner && primaryOwner.id !== userId) || (alternateOwner && alternateOwner.userId !== userId)) {
            return c.json({ error: `Login email ${email} is already assigned to another user.` }, 409);
        }
    }
    for (const item of existing) {
        if (!keep.has(item.email)) await db.delete(userLoginEmails).where(eq(userLoginEmails.id, item.id));
    }
    for (const email of emails) {
        await db.insert(userLoginEmails).values({ userId, email }).onConflictDoNothing();
    }
    return c.json({ alternateEmails: emails });
});

const PERMISSION_FIELDS = ['isOwner', 'isAdmin', 'isPageEditor', 'isDirectoryEditor', 'isFinance'] as const;
type PermissionField = (typeof PERMISSION_FIELDS)[number];

// A non-Owner admin acting on an Owner's account could take it over (alias login email,
// steal a magic link) or lock the Owner out, so those actions are Owner-only.
async function ownerTargetBlocked(
    db: ReturnType<typeof drizzle>,
    actor: { isOwner?: boolean | null },
    targetUserId: number,
): Promise<boolean> {
    if (hasOwner(actor)) return false;
    const target = await db.select({ isOwner: users.isOwner }).from(users).where(eq(users.id, targetUserId)).get();
    return Boolean(target?.isOwner);
}

async function logAccessControlChange(
    db: ReturnType<typeof drizzle>,
    actorUserId: number,
    targetUserId: number,
    action: string,
    details: Record<string, unknown>,
) {
    await db.insert(activityLogs).values({
        actorUserId,
        targetUserId,
        category: 'access_control',
        action,
        details: JSON.stringify(details),
    });
}

app.get('/api/admin/users/search', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const query = (c.req.query('q') ?? '').trim();
    if (!query) return c.json([]);

    const term = `%${query}%`;
    const columns = {
        residentId: residents.id,
        firstName: residents.firstName,
        lastName: residents.lastName,
        residentEmail: residents.email,
        userId: users.id,
        userEmail: users.email,
        isOwner: users.isOwner,
        isAdmin: users.isAdmin,
        isPageEditor: users.isPageEditor,
        isDirectoryEditor: users.isDirectoryEditor,
        isFinance: users.isFinance,
    };
    // Three passes cover every place an account can be found: residents who have never
    // logged in (no users row yet), the account's primary login email, and its aliases.
    const [residentRows, userRows, aliasRows] = await Promise.all([
        db.select(columns).from(residents)
            .leftJoin(users, eq(users.residentId, residents.id))
            .where(or(
                like(residents.firstName, term),
                like(residents.lastName, term),
                like(residents.email, term),
                like(sql`${residents.firstName} || ' ' || ${residents.lastName}`, term),
            ))
            .limit(20).all(),
        db.select(columns).from(users)
            .leftJoin(residents, eq(residents.id, users.residentId))
            .where(like(users.email, term))
            .limit(20).all(),
        db.select(columns).from(userLoginEmails)
            .innerJoin(users, eq(users.id, userLoginEmails.userId))
            .leftJoin(residents, eq(residents.id, users.residentId))
            .where(like(userLoginEmails.email, term))
            .limit(20).all(),
    ]);

    const merged = new Map<string, (typeof residentRows)[number] | (typeof userRows)[number] | (typeof aliasRows)[number]>();
    for (const row of [...residentRows, ...userRows, ...aliasRows]) {
        const key = row.userId ? `u${row.userId}` : `r${row.residentId}`;
        if (!merged.has(key)) merged.set(key, row);
    }

    return c.json([...merged.values()].slice(0, 20).map((row) => ({
        userId: row.userId,
        residentId: row.residentId,
        email: row.userEmail ?? row.residentEmail ?? '',
        displayName: row.firstName ? `${row.firstName} ${row.lastName}` : (row.userEmail ?? row.residentEmail ?? 'Unknown'),
        isOwner: row.isOwner,
        isAdmin: row.isAdmin,
        isPageEditor: row.isPageEditor,
        isDirectoryEditor: row.isDirectoryEditor,
        isFinance: row.isFinance,
    })));
});

// Materializes a users row for a resident who has never logged in, so an admin can grant
// access before the resident's first sign-in.
app.post('/api/admin/access-control/users', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const body = await c.req.json<{ residentId?: number; email?: string }>().catch(() => ({}) as { residentId?: number; email?: string });

    let resident = null;
    if (Number.isInteger(body.residentId)) {
        resident = await db.select().from(residents).where(eq(residents.id, body.residentId!)).get();
        if (!resident) return c.json({ error: 'Resident not found.' }, 404);
    }
    const email = normalizeEmail(body.email ?? resident?.email ?? '');
    if (!email || !email.includes('@')) return c.json({ error: 'A valid email is required to add this user.' }, 400);

    let user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
        // The email may be an alias in userLoginEmails rather than a users.email row.
        const alias = await db.select({ userId: userLoginEmails.userId }).from(userLoginEmails).where(eq(userLoginEmails.email, email)).get();
        if (alias) user = await db.select().from(users).where(eq(users.id, alias.userId)).get();
    }
    if (!user && resident) {
        // Mirror the canonical-account rule from /api/auth/verify: a resident can only have
        // one users row, so reuse the existing one and file this email as an alias.
        const canonicalUser = await db.select().from(users).where(eq(users.residentId, resident.id)).orderBy(asc(users.id)).get();
        if (canonicalUser) {
            await db.insert(userLoginEmails).values({ userId: canonicalUser.id, email }).onConflictDoNothing();
            user = canonicalUser;
        }
    }
    if (!user) {
        user = await db.insert(users).values({
            email,
            residentId: resident?.id ?? null,
            linkStatus: resident ? 'admin_linked' : 'unlinked',
        }).returning().then((rows) => rows[0]);
    } else if (resident && !user.residentId) {
        user = await db.update(users).set({ residentId: resident.id, linkStatus: 'admin_linked', updatedAt: new Date() })
            .where(eq(users.id, user.id)).returning().then((rows) => rows[0]);
    }
    return c.json({ user });
});

app.get('/api/admin/users/with-access', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db.select({
        id: users.id,
        email: users.email,
        isOwner: users.isOwner,
        isAdmin: users.isAdmin,
        isPageEditor: users.isPageEditor,
        isDirectoryEditor: users.isDirectoryEditor,
        isFinance: users.isFinance,
        firstName: residents.firstName,
        lastName: residents.lastName,
    }).from(users)
        .leftJoin(residents, eq(residents.id, users.residentId))
        .where(or(eq(users.isOwner, true), eq(users.isAdmin, true), eq(users.isPageEditor, true), eq(users.isDirectoryEditor, true), eq(users.isFinance, true)))
        .orderBy(asc(users.email)).all();

    return c.json(rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.firstName ? `${row.firstName} ${row.lastName}` : row.email,
        isOwner: row.isOwner,
        isAdmin: row.isAdmin,
        isPageEditor: row.isPageEditor,
        isDirectoryEditor: row.isDirectoryEditor,
        isFinance: row.isFinance,
    })));
});

app.put('/api/admin/users/:userId/permissions', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const actor = c.get('user') as { id: number; isOwner?: boolean };
    const userId = Number(c.req.param('userId'));
    const body = await c.req.json<{ field?: PermissionField; value?: boolean }>().catch(() => ({}) as { field?: PermissionField; value?: boolean });
    if (!Number.isInteger(userId) || !body.field || !PERMISSION_FIELDS.includes(body.field) || typeof body.value !== 'boolean') {
        return c.json({ error: 'Invalid permission update.' }, 400);
    }
    if (body.field === 'isOwner' && !actor.isOwner) return c.json({ error: 'Only an Owner can change the Owner permission.' }, 403);

    const target = await db.select().from(users).where(eq(users.id, userId)).get();
    if (!target) return c.json({ error: 'User not found.' }, 404);
    if (target.isOwner && !actor.isOwner) return c.json({ error: 'Only an Owner can change an Owner\u2019s permissions.' }, 403);

    if (body.field === 'isOwner' && !body.value) {
        if (target.id === actor.id) {
            return c.json({ error: 'You cannot remove your own Owner permission.' }, 409);
        }
        const ownerCount = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.isOwner, true)).get();
        if (target.isOwner && (ownerCount?.count ?? 0) <= 1) {
            return c.json({ error: 'At least one Owner is required.' }, 409);
        }
    }

    const nextValues: Partial<Record<PermissionField, boolean>> = { [body.field]: body.value };
    if (body.field === 'isOwner' && body.value) nextValues.isAdmin = true; // Owner always implies Admin

    await db.update(users).set(nextValues).where(eq(users.id, userId));
    await logAccessControlChange(db, actor.id, userId, 'set_permission', { field: body.field, from: target[body.field], to: body.value });

    const updated = await db.select().from(users).where(eq(users.id, userId)).get();
    return c.json({ user: updated });
});

app.post('/api/admin/users/:userId/permissions/clear', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const actor = c.get('user') as { id: number; isOwner?: boolean };
    const userId = Number(c.req.param('userId'));
    if (!Number.isInteger(userId)) return c.json({ error: 'Invalid user ID.' }, 400);

    const target = await db.select().from(users).where(eq(users.id, userId)).get();
    if (!target) return c.json({ error: 'User not found.' }, 404);
    if (target.isOwner && !actor.isOwner) return c.json({ error: 'Only an Owner can remove Owner access.' }, 403);
    if (target.isOwner && target.id === actor.id) return c.json({ error: 'You cannot clear your own Owner access.' }, 409);

    if (target.isOwner) {
        const ownerCount = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.isOwner, true)).get();
        if ((ownerCount?.count ?? 0) <= 1) return c.json({ error: 'At least one Owner is required.' }, 409);
    }

    const before = {
        isOwner: target.isOwner,
        isAdmin: target.isAdmin,
        isPageEditor: target.isPageEditor,
        isDirectoryEditor: target.isDirectoryEditor,
        isFinance: target.isFinance,
    };
    await db.update(users).set({ isOwner: false, isAdmin: false, isPageEditor: false, isDirectoryEditor: false, isFinance: false }).where(eq(users.id, userId));
    await logAccessControlChange(db, actor.id, userId, 'clear_permissions', { before });

    return c.json({ cleared: true });
});

async function logUserManagementChange(
    db: ReturnType<typeof drizzle>,
    actorUserId: number,
    targetUserId: number,
    action: string,
    details: Record<string, unknown>,
) {
    await db.insert(activityLogs).values({
        actorUserId,
        targetUserId,
        category: 'user_management',
        action,
        details: JSON.stringify(details),
    });
}

app.get('/api/admin/login-users', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const query = (c.req.query('q') ?? '').trim();

    let matchedUserIds: number[] | null = null;
    if (query) {
        const term = `%${query}%`;
        const [residentRows, userRows, aliasRows] = await Promise.all([
            db.select({ userId: users.id }).from(residents)
                .innerJoin(users, eq(users.residentId, residents.id))
                .where(or(
                    like(residents.firstName, term),
                    like(residents.lastName, term),
                    like(residents.email, term),
                    like(sql`${residents.firstName} || ' ' || ${residents.lastName}`, term),
                ))
                .all(),
            db.select({ userId: users.id }).from(users).where(like(users.email, term)).all(),
            db.select({ userId: userLoginEmails.userId }).from(userLoginEmails).where(like(userLoginEmails.email, term)).all(),
        ]);
        matchedUserIds = [...new Set([...residentRows, ...userRows, ...aliasRows].map((row) => row.userId))];
        if (!matchedUserIds.length) return c.json([]);
    }

    const rows = await db.select({
        id: users.id,
        email: users.email,
        isSuspended: users.isSuspended,
        lastLoginAt: users.lastLoginAt,
        firstName: residents.firstName,
        lastName: residents.lastName,
    }).from(users)
        .leftJoin(residents, eq(residents.id, users.residentId))
        .where(matchedUserIds ? inArray(users.id, matchedUserIds) : undefined)
        .orderBy(desc(users.lastLoginAt))
        .limit(100).all();

    const userIds = rows.map((row) => row.id);
    const sessionRows = userIds.length
        ? await db.select({
            userId: sessions.userId,
            count: sql<number>`count(*)`,
            lastSeenAt: sql<number | null>`max(${sessions.lastSeenAt})`,
        }).from(sessions).where(inArray(sessions.userId, userIds)).groupBy(sessions.userId).all()
        : [];
    const sessionByUser = new Map(sessionRows.map((row) => [row.userId, row]));

    return c.json(rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.firstName ? `${row.firstName} ${row.lastName}` : row.email,
        isSuspended: Boolean(row.isSuspended),
        lastLoginAt: row.lastLoginAt,
        sessionCount: sessionByUser.get(row.id)?.count ?? 0,
        lastSeenAt: sessionByUser.get(row.id)?.lastSeenAt ?? null,
    })));
});

app.get('/api/admin/users/:userId/sessions', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const actor = c.get('user') as { id: number; isOwner?: boolean };
    const userId = Number(c.req.param('userId'));
    if (!Number.isInteger(userId)) return c.json({ error: 'Invalid user ID.' }, 400);
    if (await ownerTargetBlocked(db, actor, userId)) return c.json({ error: 'Only an Owner can manage an Owner account.' }, 403);
    const rows = await db.select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        ipAddress: sessions.ipAddress,
        lastSeenAt: sessions.lastSeenAt,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
    }).from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.lastSeenAt)).all();
    // Session IDs are hashed tokens, not safe to expose to the client as-is; use row order as a stable handle instead.
    return c.json(rows.map((row, index) => ({ ...row, id: index })));
});

app.delete('/api/admin/users/:userId/sessions/:sessionIndex', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const actor = c.get('user') as { id: number; isOwner?: boolean };
    const userId = Number(c.req.param('userId'));
    const sessionIndex = Number(c.req.param('sessionIndex'));
    if (!Number.isInteger(userId) || !Number.isInteger(sessionIndex) || sessionIndex < 0) return c.json({ error: 'Invalid session.' }, 400);
    if (await ownerTargetBlocked(db, actor, userId)) return c.json({ error: 'Only an Owner can manage an Owner account.' }, 403);

    const rows = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.lastSeenAt)).all();
    const target = rows[sessionIndex];
    if (!target) return c.json({ error: 'Session not found.' }, 404);

    await db.delete(sessions).where(eq(sessions.id, target.id));
    await logUserManagementChange(db, actor.id, userId, 'revoke_session', {});
    return c.json({ revoked: true });
});

app.put('/api/admin/users/:userId/suspend', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const actor = c.get('user') as { id: number; isOwner?: boolean };
    const userId = Number(c.req.param('userId'));
    const body = await c.req.json<{ suspended?: boolean }>().catch(() => ({}) as { suspended?: boolean });
    if (!Number.isInteger(userId) || typeof body.suspended !== 'boolean') return c.json({ error: 'Invalid suspension update.' }, 400);
    if (await ownerTargetBlocked(db, actor, userId)) return c.json({ error: 'Only an Owner can manage an Owner account.' }, 403);

    const target = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
    if (!target) return c.json({ error: 'User not found.' }, 404);

    await db.update(users).set({ isSuspended: body.suspended, updatedAt: new Date() }).where(eq(users.id, userId));
    if (body.suspended) await db.delete(sessions).where(eq(sessions.userId, userId));
    await logUserManagementChange(db, actor.id, userId, body.suspended ? 'suspend' : 'unsuspend', {});

    return c.json({ isSuspended: body.suspended });
});

app.post('/api/admin/users/:userId/force-logout', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const actor = c.get('user') as { id: number; isOwner?: boolean };
    const userId = Number(c.req.param('userId'));
    if (!Number.isInteger(userId)) return c.json({ error: 'Invalid user ID.' }, 400);
    if (await ownerTargetBlocked(db, actor, userId)) return c.json({ error: 'Only an Owner can manage an Owner account.' }, 403);

    const target = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
    if (!target) return c.json({ error: 'User not found.' }, 404);

    const existing = await db.select({ count: sql<number>`count(*)` }).from(sessions).where(eq(sessions.userId, userId)).get();
    await db.delete(sessions).where(eq(sessions.userId, userId));
    const sessionsRemoved = existing?.count ?? 0;
    await logUserManagementChange(db, actor.id, userId, 'force_logout', { sessionsRemoved });

    return c.json({ sessionsRemoved });
});

app.post('/api/admin/users/:userId/send-magic-link', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const actor = c.get('user') as { id: number; isOwner?: boolean };
    const userId = Number(c.req.param('userId'));
    if (!Number.isInteger(userId)) return c.json({ error: 'Invalid user ID.' }, 400);
    if (await ownerTargetBlocked(db, actor, userId)) return c.json({ error: 'Only an Owner can manage an Owner account.' }, 403);

    const target = await db.select({ id: users.id, email: users.email, isSuspended: users.isSuspended }).from(users).where(eq(users.id, userId)).get();
    if (!target) return c.json({ error: 'User not found.' }, 404);
    if (target.isSuspended) return c.json({ error: 'Cannot send a sign-in link to a suspended account.' }, 409);

    const token = await createMagicLinkToken(db, target.email);
    try {
        const [adminEmail, siteName] = await Promise.all([
            getSetting(db, 'admin_email', DEFAULT_ADMIN_EMAIL),
            getSetting(db, 'site_name', DEFAULT_SITE_NAME),
        ]);
        await sendMagicLinkEmail(c.env.EMAIL, target.email, token.rawToken, token.rawCode, new URL(c.req.url).origin, adminEmail, siteName);
    } catch (error) {
        const emailError = error as { code?: string; message?: string };
        console.error('Admin-triggered magic-link email failed', { code: emailError.code ?? 'UNKNOWN', message: emailError.message ?? 'Unknown email provider error' });
        return c.json({ error: 'We could not send the email right now. Please try again later.' }, 503);
    }
    await logUserManagementChange(db, actor.id, userId, 'magic_link_dispatch', {});

    return c.json({ sent: true });
});

async function fetchActivityLogRows(db: ReturnType<typeof drizzle>, options: { category?: string; query?: string; limit?: number }) {
    const targetUsers = alias(users, 'target_users');
    const conditions: SQL[] = [];
    if (options.category) conditions.push(eq(activityLogs.category, options.category as typeof activityLogs.$inferSelect.category));
    if (options.query) conditions.push(or(like(users.email, `%${options.query}%`), like(targetUsers.email, `%${options.query}%`), like(activityLogs.action, `%${options.query}%`))!);

    return db.select({
        id: activityLogs.id,
        category: activityLogs.category,
        action: activityLogs.action,
        details: activityLogs.details,
        createdAt: activityLogs.createdAt,
        actorEmail: users.email,
        targetEmail: targetUsers.email,
    }).from(activityLogs)
        .leftJoin(users, eq(users.id, activityLogs.actorUserId))
        .leftJoin(targetUsers, eq(targetUsers.id, activityLogs.targetUserId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(activityLogs.createdAt))
        .limit(Math.min(options.limit ?? 50, 200)).all();
}

app.get('/api/admin/activity-logs', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await fetchActivityLogRows(db, {
        category: c.req.query('category'),
        query: (c.req.query('q') ?? '').trim(),
        limit: Number(c.req.query('limit')) || 50,
    });
    return c.json(rows);
});

// Open to any admin-page role (not just isAdmin) per the Log Viewer spec.
app.get('/api/admin/log-viewer/logs', requireAuth(), requireAnyAdminRole(), async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await fetchActivityLogRows(db, {
        category: c.req.query('category'),
        query: (c.req.query('q') ?? '').trim(),
        limit: Number(c.req.query('limit')) || 50,
    });
    return c.json(rows);
});

app.get('/api/admin/log-viewer/archives', requireAuth(), requireAnyAdminRole(), async (c) => {
    const db = drizzle(c.env.DB);
    const query = (c.req.query('q') ?? '').trim();
    const limit = Math.min(Number(c.req.query('limit')) || 50, 200);

    const conditions: SQL[] = [];
    if (query) conditions.push(or(like(households.streetAddress, `%${query}%`), like(householdArchive.snapshot, `%${query}%`))!);

    const rows = await db.select({
        id: householdArchive.id,
        streetAddress: households.streetAddress,
        archivedAt: householdArchive.archivedAt,
        snapshot: householdArchive.snapshot,
    }).from(householdArchive)
        .leftJoin(households, eq(households.id, householdArchive.addressId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(householdArchive.archivedAt))
        .limit(limit).all();

    const results = rows.map((row) => {
        let residents: Array<{ firstName: string; lastName: string; email: string | null; phoneMobile: string | null; phoneHome: string | null }> = [];
        try {
            const parsed = JSON.parse(row.snapshot) as { residents?: typeof residents };
            residents = parsed.residents ?? [];
        } catch {
            residents = [];
        }
        return {
            id: row.id,
            streetAddress: row.streetAddress,
            archivedAt: row.archivedAt,
            residents: residents.map((resident) => ({
                name: `${resident.firstName} ${resident.lastName}`,
                email: resident.email ?? null,
                phone: resident.phoneMobile ?? resident.phoneHome ?? null,
            })),
        };
    });

    return c.json(results);
});

app.get('/api/admin/log-viewer/archives/:archiveId', requireAuth(), requireAnyAdminRole(), async (c) => {
    const db = drizzle(c.env.DB);
    const archiveId = Number(c.req.param('archiveId'));
    if (!Number.isInteger(archiveId)) return c.json({ error: 'Invalid archive ID.' }, 400);

    const row = await db.select({
        id: householdArchive.id,
        streetAddress: households.streetAddress,
        archivedAt: householdArchive.archivedAt,
        archivedByAdminId: householdArchive.archivedByAdminId,
        snapshot: householdArchive.snapshot,
    }).from(householdArchive)
        .leftJoin(households, eq(households.id, householdArchive.addressId))
        .where(eq(householdArchive.id, archiveId)).get();
    if (!row) return c.json({ error: 'Archive record not found.' }, 404);

    let snapshot: unknown = null;
    try {
        snapshot = JSON.parse(row.snapshot);
    } catch {
        snapshot = null;
    }

    return c.json({ id: row.id, streetAddress: row.streetAddress, archivedAt: row.archivedAt, archivedByAdminId: row.archivedByAdminId, snapshot });
});

app.get('/api/admin/log-viewer/last-seen', requireAuth(), requireAnyAdminRole(), async (c) => {
    const db = drizzle(c.env.DB);
    const query = (c.req.query('q') ?? '').trim();

    let matchedUserIds: number[] | null = null;
    if (query) {
        const term = `%${query}%`;
        const [residentRows, userRows, aliasRows] = await Promise.all([
            db.select({ userId: users.id }).from(residents)
                .innerJoin(users, eq(users.residentId, residents.id))
                .where(or(
                    like(residents.firstName, term),
                    like(residents.lastName, term),
                    like(residents.email, term),
                    like(sql`${residents.firstName} || ' ' || ${residents.lastName}`, term),
                ))
                .all(),
            db.select({ userId: users.id }).from(users).where(like(users.email, term)).all(),
            db.select({ userId: userLoginEmails.userId }).from(userLoginEmails).where(like(userLoginEmails.email, term)).all(),
        ]);
        matchedUserIds = [...new Set([...residentRows, ...userRows, ...aliasRows].map((row) => row.userId))];
        if (!matchedUserIds.length) return c.json([]);
    }

    const sessionRows = await db.select({
        userId: sessions.userId,
        lastSeenAt: sql<number | null>`max(${sessions.lastSeenAt})`,
    }).from(sessions)
        .where(matchedUserIds ? inArray(sessions.userId, matchedUserIds) : undefined)
        .groupBy(sessions.userId)
        .having(sql`max(${sessions.lastSeenAt}) is not null`)
        .orderBy(desc(sql`max(${sessions.lastSeenAt})`))
        .limit(100).all();
    if (!sessionRows.length) return c.json([]);

    const userIds = sessionRows.map((row) => row.userId);
    const userRows = await db.select({
        id: users.id,
        email: users.email,
        firstName: residents.firstName,
        lastName: residents.lastName,
    }).from(users)
        .leftJoin(residents, eq(residents.id, users.residentId))
        .where(inArray(users.id, userIds)).all();
    const userById = new Map(userRows.map((row) => [row.id, row]));

    return c.json(sessionRows.map((row) => {
        const user = userById.get(row.userId);
        return {
            userId: row.userId,
            email: user?.email ?? null,
            residentName: user?.firstName ? `${user.firstName} ${user.lastName}` : null,
            lastSeenAt: row.lastSeenAt,
        };
    }));
});

app.patch('/api/admin/access-requests/:requestId', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const requestId = Number(c.req.param('requestId'));
    const body = await c.req.json<{ status?: 'approved' | 'rejected'; residentId?: number; notes?: string }>();
    const admin = c.get('user') as { id: number };
    const reviewStatus = body.status;
    if (!Number.isInteger(requestId) || !reviewStatus || !['approved', 'rejected'].includes(reviewStatus)) {
        return c.json({ error: 'Invalid access request update.' }, 400);
    }
    if (reviewStatus === 'approved' && !Number.isInteger(body.residentId)) {
        return c.json({ error: 'A resident must be selected for approval.' }, 400);
    }

    const request = await db.select().from(accessRequests).where(eq(accessRequests.id, requestId)).get();
    if (!request) return c.json({ error: 'Access request not found.' }, 404);

    const normalizedRequestEmail = normalizeEmail(request.email);
    const targetResident = body.residentId
        ? await db.select({ id: residents.id, householdId: residents.householdId }).from(residents).where(eq(residents.id, body.residentId)).get()
        : null;
    if (reviewStatus === 'approved' && !targetResident) return c.json({ error: 'Selected directory resident was not found.' }, 400);

    let outcomeToken: string | null = null;
    if (reviewStatus === 'approved') {
        const user = await db.select().from(users).where(eq(users.email, normalizedRequestEmail)).get();
        if (!user) return c.json({ error: 'The requester account was not found.' }, 404);
        const alternateOwner = await db.select({ userId: userLoginEmails.userId }).from(userLoginEmails)
            .where(eq(userLoginEmails.email, normalizedRequestEmail)).get();
        if (alternateOwner && alternateOwner.userId !== user.id) return c.json({ error: 'This email is already assigned to another user.' }, 409);
        await db.insert(userLoginEmails).values({ userId: user.id, email: normalizedRequestEmail }).onConflictDoNothing();
        await db.update(users).set({ residentId: targetResident!.id, linkStatus: 'admin_linked', updatedAt: new Date() }).where(eq(users.id, user.id));
        outcomeToken = (await createMagicLinkToken(db, normalizedRequestEmail, approvalLinkLifetimeMinutes)).rawToken;
    }
    await db.update(accessRequests).set({
        status: reviewStatus,
        reviewedByUserId: admin.id,
        reviewedAt: new Date(),
        notes: body.notes ?? null,
    }).where(eq(accessRequests.id, requestId));
    try {
        const [adminEmail, siteName] = await Promise.all([
            getSetting(db, 'admin_email', DEFAULT_ADMIN_EMAIL),
            getSetting(db, 'site_name', DEFAULT_SITE_NAME),
        ]);
        await sendAccessRequestOutcomeEmail(c.env.EMAIL, normalizedRequestEmail, reviewStatus, outcomeToken, new URL(c.req.url).origin, adminEmail, siteName);
    } catch (error) {
        const emailError = error as { code?: string; message?: string };
        console.error('Access request outcome email failed', { code: emailError.code ?? 'UNKNOWN', message: emailError.message ?? 'Unknown email provider error' });
        return c.json({ success: true, emailSent: false, warning: 'The request was updated, but the outcome email could not be sent.' });
    }
    return c.json({ success: true, emailSent: true });
});

app.post('/api/households/:householdId/favorite', requireAuth(), requireDirectory(), async (c) => {
    const db = drizzle(c.env.DB);
    const userId = (c.get('user') as { id: number }).id;
    const householdId = Number(c.req.param('householdId'));

    if (!Number.isInteger(householdId)) return c.json({ error: 'Invalid household ID' }, 400);

    const household = await db.select({ id: households.id }).from(households).where(eq(households.id, householdId)).get();
    if (!household) return c.json({ error: 'Household not found' }, 404);

    await db.insert(householdFavorites).values({ userId, householdId }).onConflictDoNothing();
    return c.json({ favorited: true });
});

app.delete('/api/households/:householdId/favorite', requireAuth(), requireDirectory(), async (c) => {
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

app.get('/api/directory', requireAuth(), requireDirectory(), async (c) => {
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
            like(sql`${residents.firstName} || ' ' || ${residents.lastName}`, `%${q}%`),
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

    const combinedFilter = filters.length ? and(...filters) : undefined;
    const matchedHouseholdIds = combinedFilter
        ? new Set((await db.select({ id: households.id }).from(households)
            .leftJoin(residents, eq(residents.householdId, households.id))
            .leftJoin(children, eq(children.householdId, households.id))
            .where(combinedFilter).all()).map((row) => row.id))
        : null;
    const favoriteHouseholdIds = new Set((await db.select({ householdId: householdFavorites.householdId })
        .from(householdFavorites).where(eq(householdFavorites.userId, userId)).all()).map((row) => row.householdId));

    const [allResidents, allChildren] = await Promise.all([
        db.select().from(residents).all(),
        db.select().from(children).all(),
    ]);

    // Sort key is the primary contact's last name, falling back to the first resident on record.
    const primaryLastNameByHousehold = new Map<number, string>();
    for (const resident of allResidents) {
        if (resident.isPrimaryContact) primaryLastNameByHousehold.set(resident.householdId, resident.lastName);
    }
    for (const resident of allResidents) {
        if (!primaryLastNameByHousehold.has(resident.householdId)) primaryLastNameByHousehold.set(resident.householdId, resident.lastName);
    }

    const householdRows = (await db.select().from(households).where(or(eq(households.status, 'active'), eq(households.status, 'vacant'))).all()).sort((left, right) => {
        const leftName = primaryLastNameByHousehold.get(left.id);
        const rightName = primaryLastNameByHousehold.get(right.id);
        if (leftName && rightName) return leftName.localeCompare(rightName);
        if (leftName) return -1;
        if (rightName) return 1;
        return compareStreetAddresses(left.streetAddress, right.streetAddress);
    });
    const filteredHouseholds = matchedHouseholdIds
        ? householdRows.filter((h) => matchedHouseholdIds.has(h.id))
        : householdRows;
    const visibleHouseholds = filteredHouseholds
        .filter((household) => !favoritesOnly || favoriteHouseholdIds.has(household.id));

    const data = visibleHouseholds.map((household) => ({
        ...household,
        isFavorite: favoriteHouseholdIds.has(household.id),
        residents: allResidents.filter((r) => r.householdId === household.id),
        children: allChildren.filter((ch) => ch.householdId === household.id),
    }));

    return c.json(data);
});

// ==========================================
// Universal search (navbar overlay) — directory + pages
// ==========================================

async function searchDirectoryOverlay(db: ReturnType<typeof drizzle>, q: string, limit = 6) {
    const pattern = `%${q}%`;
    const [addressMatches, residentMatches, childMatches] = await Promise.all([
        db.select({ id: households.id }).from(households).where(like(households.streetAddress, pattern)).all(),
        db.select({ householdId: residents.householdId }).from(residents)
            .where(or(
                like(residents.firstName, pattern),
                like(residents.lastName, pattern),
                like(residents.email, pattern),
                like(sql`${residents.firstName} || ' ' || ${residents.lastName}`, pattern),
            )).all(),
        db.select({ householdId: children.householdId }).from(children).where(like(children.name, pattern)).all(),
    ]);

    const householdIds = new Set<number>([
        ...addressMatches.map((row) => row.id),
        ...residentMatches.map((row) => row.householdId),
        ...childMatches.map((row) => row.householdId),
    ]);
    if (!householdIds.size) return [];

    const matchedHouseholds = (await db.select().from(households)
        .where(and(inArray(households.id, Array.from(householdIds)), or(eq(households.status, 'active'), eq(households.status, 'vacant'))))
        .all())
        .sort((left, right) => compareStreetAddresses(left.streetAddress, right.streetAddress))
        .slice(0, limit);
    if (!matchedHouseholds.length) return [];

    const relatedResidents = await db.select().from(residents)
        .where(inArray(residents.householdId, matchedHouseholds.map((h) => h.id))).all();

    return matchedHouseholds.map((household) => {
        const householdResidents = relatedResidents
            .filter((r) => r.householdId === household.id)
            .sort((left, right) => Number(right.isPrimaryContact) - Number(left.isPrimaryContact));
        const names = householdResidents.map((r) => `${r.firstName} ${r.lastName}`);
        const shown = names.slice(0, 3);
        const extra = names.length > shown.length ? ` +${names.length - shown.length}` : '';
        return {
            id: household.id,
            streetAddress: household.streetAddress,
            residentSummary: names.length ? `${shown.join(', ')}${extra}` : 'Vacant',
        };
    });
}

function pageSearchSnippet(bodyMd: string, q: string): string {
    // Strip whole-document constructs first (code fences span lines, so this must
    // run before splitting into blocks below).
    const withoutCodeAndMarkup = bodyMd
        .replace(/<[^>]*>/g, ' ')                          // HTML tags
        .replace(/```[\s\S]*?```/g, ' ')                   // fenced code blocks
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')              // images — drop entirely
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');           // links — keep the visible text only

    // Group lines into blocks (heading / list item / paragraph) so a hand-wrapped
    // paragraph stays joined, but headings and list items never bleed into the
    // paragraph that follows them — otherwise collapsing all newlines to spaces
    // can make the snippet's context window land in the line before the match.
    const blocks: string[] = [];
    let current: string[] = [];
    const flushBlock = () => {
        if (current.length) blocks.push(current.join(' '));
        current = [];
    };
    for (const rawLine of withoutCodeAndMarkup.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) {
            flushBlock();
            continue;
        }
        if (/^#{1,6}\s+/.test(line) || /^[-+*]\s+/.test(line)) {
            flushBlock();
            blocks.push(line);
            continue;
        }
        current.push(line);
    }
    flushBlock();

    const cleanBlock = (text: string) => text
        .replace(/^#{1,6}\s+/, '')
        .replace(/^[-+*]\s+/, '')
        .replace(/[*_~`>#[\]()!]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const lowerQuery = q.toLowerCase();
    const cleanedBlocks = blocks.map(cleanBlock).filter(Boolean);
    const block = cleanedBlocks.find((b) => b.toLowerCase().includes(lowerQuery)) ?? cleanedBlocks[0] ?? '';

    const idx = block.toLowerCase().indexOf(lowerQuery);
    if (idx === -1) return block.slice(0, 120);
    const start = Math.max(0, idx - 40);
    const end = Math.min(block.length, idx + q.length + 80);
    return `${start > 0 ? '…' : ''}${block.slice(start, end).trim()}${end < block.length ? '…' : ''}`;
}

async function searchPagesOverlay(db: ReturnType<typeof drizzle>, q: string, isEditor: boolean, hasDirectoryAccess: boolean, limit = 6) {
    const pattern = `%${q}%`;
    const matches = await db.select().from(pages).where(or(like(pages.title, pattern), like(pages.bodyMd, pattern))).all();

    return matches
        .filter((page) => {
            if (page.isDraft) return isEditor;
            if (page.isPublic) return true;
            return hasDirectoryAccess || isEditor;
        })
        .slice(0, limit)
        .map((page) => ({
            slug: page.slug,
            title: page.title,
            snippet: pageSearchSnippet(page.bodyMd, q),
        }));
}

// Combined overlay results for the navbar search box; each source is scoped to what
// the signed-in user is otherwise allowed to see (mirrors /api/directory and /api/pages/:slug).
app.get('/api/search', requireAuth(), async (c) => {
    const q = c.req.query('q')?.trim();
    if (!q || q.length < 2) return c.json({ directory: [], pages: [] });

    const db = drizzle(c.env.DB);
    const user = c.get('user') as { residentId?: number | null; householdId?: number; isPageEditor?: boolean; isAdmin?: boolean; isOwner?: boolean };
    const isEditor = Boolean(user.isPageEditor || user.isAdmin || user.isOwner);
    const hasDirectoryAccess = Boolean(user.residentId || user.householdId);

    const [directoryResults, pageResults] = await Promise.all([
        hasDirectoryAccess ? searchDirectoryOverlay(db, q) : Promise.resolve([]),
        searchPagesOverlay(db, q, isEditor, Boolean(user.residentId)),
    ]);

    return c.json({ directory: directoryResults, pages: pageResults });
});

// ==========================================
// Pages (CMS) — page editor role required
// ==========================================

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_MIME_TYPES = new Set([
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/zip',
]);
const ATTACHMENT_ALLOWED_DESCRIPTION = 'images (PNG, JPEG, GIF, WebP, SVG), PDF, plain text, Markdown, CSV, or ZIP';
const ATTACHMENT_SIZE_DESCRIPTION = '10 MB';

type PagesDb = ReturnType<typeof drizzle>;

function slugify(value: string): string {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
}

async function uniquePageSlug(db: PagesDb, title: string, excludeId?: number): Promise<string> {
    const base = slugify(title);
    let candidate = base;
    for (let suffix = 2; ; suffix++) {
        const existing = await db.select({ id: pages.id }).from(pages).where(eq(pages.slug, candidate)).get();
        if (!existing || existing.id === excludeId) return candidate;
        candidate = `${base}-${suffix}`;
    }
}

app.get('/api/admin/pages', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db.select({
        id: pages.id,
        slug: pages.slug,
        title: pages.title,
        isPublic: pages.isPublic,
        isDraft: pages.isDraft,
        isHomepageCard: pages.isHomepageCard,
        updatedAt: pages.updatedAt,
        authorEmail: users.email,
    }).from(pages).leftJoin(users, eq(users.id, pages.authorId)).orderBy(desc(pages.updatedAt)).all();

    const counts = await db.select({
        pageId: documents.pageId,
        count: sql<number>`count(*)`,
    }).from(documents).groupBy(documents.pageId).all();
    const countByPageId = new Map(counts.map((row) => [row.pageId, row.count]));

    return c.json(rows.map((row) => ({ ...row, attachmentCount: countByPageId.get(row.id) ?? 0 })));
});

app.post('/api/admin/pages', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { id: number };
    const body = await c.req.json<{ title?: string }>().catch(() => ({ title: undefined }));
    const title = body.title?.trim() || 'Untitled page';
    const slug = await uniquePageSlug(db, title);
    const created = await db.insert(pages).values({
        slug,
        title,
        bodyMd: '',
        isDraft: true,
        authorId: user.id,
    }).returning().then((rows) => rows[0]);
    return c.json({ page: created }, 201);
});

app.get('/api/admin/pages/:pageId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const pageId = Number(c.req.param('pageId'));
    if (!Number.isInteger(pageId)) return c.json({ error: 'Invalid page ID.' }, 400);
    const page = await db.select({
        id: pages.id,
        slug: pages.slug,
        title: pages.title,
        bodyMd: pages.bodyMd,
        isPublic: pages.isPublic,
        isDraft: pages.isDraft,
        isHomepageCard: pages.isHomepageCard,
        authorId: pages.authorId,
        createdAt: pages.createdAt,
        updatedAt: pages.updatedAt,
        authorEmail: users.email,
    }).from(pages).leftJoin(users, eq(users.id, pages.authorId)).where(eq(pages.id, pageId)).get();
    if (!page) return c.json({ error: 'Page not found.' }, 404);
    return c.json({ page });
});

app.put('/api/admin/pages/:pageId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const pageId = Number(c.req.param('pageId'));
    if (!Number.isInteger(pageId)) return c.json({ error: 'Invalid page ID.' }, 400);
    const existing = await db.select({ id: pages.id }).from(pages).where(eq(pages.id, pageId)).get();
    if (!existing) return c.json({ error: 'Page not found.' }, 404);

    const body = await c.req.json<{ title?: string; slug?: string; bodyMd?: string; isPublic?: boolean; isDraft?: boolean }>();
    const title = body.title?.trim() ?? '';
    if (!title) return c.json({ error: 'Title is required.' }, 400);
    const slug = body.slug?.trim() ?? '';
    if (!SLUG_PATTERN.test(slug)) return c.json({ error: 'Slug must be lowercase letters, numbers, and hyphens.' }, 400);
    const slugConflict = await db.select({ id: pages.id }).from(pages).where(eq(pages.slug, slug)).get();
    if (slugConflict && slugConflict.id !== pageId) return c.json({ error: 'Another page already uses this slug.' }, 409);

    const updated = await db.update(pages).set({
        title,
        slug,
        bodyMd: body.bodyMd ?? '',
        isPublic: Boolean(body.isPublic),
        isDraft: Boolean(body.isDraft),
        updatedAt: new Date(),
    }).where(eq(pages.id, pageId)).returning().then((rows) => rows[0]);
    return c.json({ page: updated });
});

app.post('/api/admin/pages/:pageId/publish', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const pageId = Number(c.req.param('pageId'));
    if (!Number.isInteger(pageId)) return c.json({ error: 'Invalid page ID.' }, 400);
    const existing = await db.select({ id: pages.id }).from(pages).where(eq(pages.id, pageId)).get();
    if (!existing) return c.json({ error: 'Page not found.' }, 404);

    const body = await c.req.json<{ title?: string; slug?: string; bodyMd?: string; isPublic?: boolean }>();
    const title = body.title?.trim() ?? '';
    if (!title) return c.json({ error: 'Title is required.' }, 400);
    const slug = body.slug?.trim() ?? '';
    if (!SLUG_PATTERN.test(slug)) return c.json({ error: 'Slug must be lowercase letters, numbers, and hyphens.' }, 400);
    const slugConflict = await db.select({ id: pages.id }).from(pages).where(eq(pages.slug, slug)).get();
    if (slugConflict && slugConflict.id !== pageId) return c.json({ error: 'Another page already uses this slug.' }, 409);

    const updated = await db.update(pages).set({
        title,
        slug,
        bodyMd: body.bodyMd ?? '',
        isPublic: Boolean(body.isPublic),
        isDraft: false,
        updatedAt: new Date(),
    }).where(eq(pages.id, pageId)).returning().then((rows) => rows[0]);
    return c.json({ page: updated });
});

app.delete('/api/admin/pages/:pageId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const pageId = Number(c.req.param('pageId'));
    if (!Number.isInteger(pageId)) return c.json({ error: 'Invalid page ID.' }, 400);
    const existing = await db.select({ id: pages.id }).from(pages).where(eq(pages.id, pageId)).get();
    if (!existing) return c.json({ error: 'Page not found.' }, 404);

    const pageDocuments = await db.select({ r2Key: documents.r2Key }).from(documents).where(eq(documents.pageId, pageId)).all();
    await Promise.all(pageDocuments.map((document) => c.env.BUCKET.delete(document.r2Key)));
    await db.delete(documents).where(eq(documents.pageId, pageId));
    await db.delete(pages).where(eq(pages.id, pageId));
    return c.json({ deleted: true });
});

app.get('/api/admin/pages/:pageId/attachments', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const pageId = Number(c.req.param('pageId'));
    if (!Number.isInteger(pageId)) return c.json({ error: 'Invalid page ID.' }, 400);
    return c.json(await db.select().from(documents).where(eq(documents.pageId, pageId)).orderBy(desc(documents.createdAt)).all());
});

app.post('/api/admin/pages/:pageId/attachments', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { id: number };
    const pageId = Number(c.req.param('pageId'));
    if (!Number.isInteger(pageId)) return c.json({ error: 'Invalid page ID.' }, 400);
    const existing = await db.select({ id: pages.id }).from(pages).where(eq(pages.id, pageId)).get();
    if (!existing) return c.json({ error: 'Page not found.' }, 404);

    const formData = await c.req.parseBody();
    const file = formData['file'];
    if (!(file instanceof File)) return c.json({ error: 'A file is required.' }, 400);
    if (file.size > MAX_ATTACHMENT_BYTES) {
        return c.json({ error: `"${file.name}" is too large. Maximum size is ${ATTACHMENT_SIZE_DESCRIPTION}.` }, 413);
    }
    if (!ATTACHMENT_MIME_TYPES.has(file.type)) {
        return c.json({ error: `"${file.name}" is not a supported file type. Allowed: ${ATTACHMENT_ALLOWED_DESCRIPTION}.` }, 415);
    }

    const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_') || 'file';
    const r2Key = `pages/${pageId}/${crypto.randomUUID()}-${safeName}`;
    await c.env.BUCKET.put(r2Key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });

    const created = await db.insert(documents).values({
        pageId,
        r2Key,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        uploadedByUserId: user.id,
    }).returning().then((rows) => rows[0]);

    const url = `/api/files/${r2Key}`;
    const snippet = file.type.startsWith('image/') ? `![${file.name}](${url})` : `[${file.name}](${url})`;
    return c.json({ document: created, url, snippet }, 201);
});

app.delete('/api/admin/attachments/:documentId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const documentId = Number(c.req.param('documentId'));
    if (!Number.isInteger(documentId)) return c.json({ error: 'Invalid attachment ID.' }, 400);
    const document = await db.select().from(documents).where(eq(documents.id, documentId)).get();
    if (!document) return c.json({ error: 'Attachment not found.' }, 404);
    await c.env.BUCKET.delete(document.r2Key);
    await db.delete(documents).where(eq(documents.id, documentId));
    return c.json({ deleted: true });
});

// All uploaded images across pages — lets editors reuse an existing image.
app.get('/api/admin/attachments/images', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db.select().from(documents).where(like(documents.mimeType, 'image/%')).orderBy(desc(documents.createdAt)).all();
    return c.json(rows);
});

// ==========================================
// Document Library (single-level Folders -> Documents) — Google-Drive-style
// archive, distinct from the per-page Attachments above (folderId vs pageId).
// ==========================================

const DOCUMENT_LIBRARY_MAX_BYTES = 20 * 1024 * 1024;
const DOCUMENT_LIBRARY_SIZE_DESCRIPTION = '20 MB';
const DOCUMENT_LIBRARY_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const OFFICE_MIME_TYPES = new Set([
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

function documentDisplayName(document: { name: string | null; filename: string }): string {
    return document.name?.trim() || document.filename;
}

app.get('/api/admin/document-folders', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const folders = await db.select().from(documentFolders).orderBy(asc(documentFolders.name)).all();
    const docCounts = await db.select({ folderId: documents.folderId, count: sql<number>`count(*)` })
        .from(documents).where(isNull(documents.pageId)).groupBy(documents.folderId).all();
    const countByFolder = new Map(docCounts.map((row) => [row.folderId, row.count]));
    return c.json(folders.map((folder) => ({ ...folder, documentCount: countByFolder.get(folder.id) ?? 0 })));
});

app.post('/api/admin/document-folders', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const body = await c.req.json<{ name?: string; description?: string }>().catch(() => ({} as Record<string, never>));
    const name = body.name?.trim();
    if (!name) return c.json({ error: 'Folder name is required.' }, 400);
    const created = await db.insert(documentFolders).values({
        name,
        description: body.description?.trim() || null,
    }).returning().then((rows) => rows[0]);
    return c.json({ folder: created }, 201);
});

app.put('/api/admin/document-folders/:folderId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const folderId = Number(c.req.param('folderId'));
    if (!Number.isInteger(folderId)) return c.json({ error: 'Invalid folder ID.' }, 400);
    const existing = await db.select({ id: documentFolders.id }).from(documentFolders).where(eq(documentFolders.id, folderId)).get();
    if (!existing) return c.json({ error: 'Folder not found.' }, 404);

    const body = await c.req.json<{ name?: string; description?: string }>();
    const name = body.name?.trim();
    if (!name) return c.json({ error: 'Folder name is required.' }, 400);
    const updated = await db.update(documentFolders).set({
        name,
        description: body.description?.trim() || null,
        updatedAt: new Date(),
    }).where(eq(documentFolders.id, folderId)).returning().then((rows) => rows[0]);
    return c.json({ folder: updated });
});

app.delete('/api/admin/document-folders/:folderId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const folderId = Number(c.req.param('folderId'));
    if (!Number.isInteger(folderId)) return c.json({ error: 'Invalid folder ID.' }, 400);
    const existing = await db.select({ id: documentFolders.id }).from(documentFolders).where(eq(documentFolders.id, folderId)).get();
    if (!existing) return c.json({ error: 'Folder not found.' }, 404);

    const docRows = await db.select({ r2Key: documents.r2Key }).from(documents).where(eq(documents.folderId, folderId)).all();
    await Promise.all(docRows.map((document) => c.env.BUCKET.delete(document.r2Key)));
    await db.delete(documents).where(eq(documents.folderId, folderId));
    await db.delete(documentFolders).where(eq(documentFolders.id, folderId));
    return c.json({ deleted: true });
});

app.get('/api/admin/document-folders/:folderId/documents', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const folderId = Number(c.req.param('folderId'));
    if (!Number.isInteger(folderId)) return c.json({ error: 'Invalid folder ID.' }, 400);
    const rows = await db.select().from(documents).where(eq(documents.folderId, folderId)).orderBy(desc(documents.createdAt)).all();
    return c.json(rows);
});

// Cross-folder search for the admin Document Library and the Page Editor attachment picker.
app.get('/api/admin/documents/search', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const q = c.req.query('q')?.trim() ?? '';
    const type = c.req.query('type')?.trim() ?? '';
    const conditions = [sql`${documents.folderId} is not null`];
    if (q) conditions.push(or(like(documents.name, `%${q}%`), like(documents.filename, `%${q}%`))!);
    if (type === 'pdf') conditions.push(eq(documents.mimeType, 'application/pdf'));
    else if (type === 'image') conditions.push(like(documents.mimeType, 'image/%'));
    const rows = await db.select().from(documents).where(and(...conditions)).orderBy(desc(documents.createdAt)).all();
    return c.json(rows);
});

app.post('/api/admin/document-folders/:folderId/documents', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { id: number };
    const folderId = Number(c.req.param('folderId'));
    if (!Number.isInteger(folderId)) return c.json({ error: 'Invalid folder ID.' }, 400);
    const folder = await db.select({ id: documentFolders.id }).from(documentFolders).where(eq(documentFolders.id, folderId)).get();
    if (!folder) return c.json({ error: 'Folder not found.' }, 404);

    const formData = await c.req.parseBody();
    const file = formData['file'];
    if (!(file instanceof File)) return c.json({ error: 'A file is required.' }, 400);
    if (OFFICE_MIME_TYPES.has(file.type)) {
        return c.json({ error: 'MS Office files are not supported. Please convert to PDF before uploading.' }, 415);
    }
    if (!DOCUMENT_LIBRARY_MIME_TYPES.has(file.type)) {
        return c.json({ error: `"${file.name}" is not a supported file type. Allowed: PDF or images (PNG, JPEG, GIF, WebP).` }, 415);
    }
    if (file.size > DOCUMENT_LIBRARY_MAX_BYTES) {
        return c.json({ error: `"${file.name}" is too large. Maximum size is ${DOCUMENT_LIBRARY_SIZE_DESCRIPTION}.` }, 413);
    }

    const conflict = await db.select({ id: documents.id, filename: documents.filename })
        .from(documents).where(and(eq(documents.folderId, folderId), eq(documents.filename, file.name))).get();
    if (conflict && c.req.query('replace') !== 'true') {
        return c.json({ error: `A document named "${file.name}" already exists in this folder.`, existingDocumentId: conflict.id }, 409);
    }

    if (conflict) {
        const existing = await db.select().from(documents).where(eq(documents.id, conflict.id)).get();
        await c.env.BUCKET.delete(existing!.r2Key);
        await c.env.BUCKET.put(existing!.r2Key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
        const updated = await db.update(documents).set({
            mimeType: file.type,
            sizeBytes: file.size,
            isDraft: true,
            updatedAt: new Date(),
        }).where(eq(documents.id, conflict.id)).returning().then((rows) => rows[0]);
        return c.json({ document: updated }, 200);
    }

    const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_') || 'file';
    const r2Key = `library/${folderId}/${crypto.randomUUID()}-${safeName}`;
    await c.env.BUCKET.put(r2Key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });

    const created = await db.insert(documents).values({
        folderId,
        r2Key,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        isDraft: true,
        uploadedByUserId: user.id,
    }).returning().then((rows) => rows[0]);
    return c.json({ document: created }, 201);
});

app.put('/api/admin/documents/:documentId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const documentId = Number(c.req.param('documentId'));
    if (!Number.isInteger(documentId)) return c.json({ error: 'Invalid document ID.' }, 400);
    const existing = await db.select({ id: documents.id, folderId: documents.folderId }).from(documents).where(eq(documents.id, documentId)).get();
    if (!existing || existing.folderId === null) return c.json({ error: 'Document not found.' }, 404);

    const body = await c.req.json<{ name?: string; description?: string; isDraft?: boolean }>();
    const updated = await db.update(documents).set({
        name: body.name?.trim() || null,
        description: body.description?.trim() || null,
        isDraft: Boolean(body.isDraft),
        updatedAt: new Date(),
    }).where(eq(documents.id, documentId)).returning().then((rows) => rows[0]);
    return c.json({ document: updated });
});

app.put('/api/admin/documents/:documentId/replace', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const documentId = Number(c.req.param('documentId'));
    if (!Number.isInteger(documentId)) return c.json({ error: 'Invalid document ID.' }, 400);
    const existing = await db.select().from(documents).where(eq(documents.id, documentId)).get();
    if (!existing || existing.folderId === null) return c.json({ error: 'Document not found.' }, 404);

    const formData = await c.req.parseBody();
    const file = formData['file'];
    if (!(file instanceof File)) return c.json({ error: 'A file is required.' }, 400);
    if (OFFICE_MIME_TYPES.has(file.type)) {
        return c.json({ error: 'MS Office files are not supported. Please convert to PDF before uploading.' }, 415);
    }
    if (!DOCUMENT_LIBRARY_MIME_TYPES.has(file.type)) {
        return c.json({ error: `"${file.name}" is not a supported file type. Allowed: PDF or images (PNG, JPEG, GIF, WebP).` }, 415);
    }
    if (file.size > DOCUMENT_LIBRARY_MAX_BYTES) {
        return c.json({ error: `"${file.name}" is too large. Maximum size is ${DOCUMENT_LIBRARY_SIZE_DESCRIPTION}.` }, 413);
    }

    await c.env.BUCKET.delete(existing.r2Key);
    await c.env.BUCKET.put(existing.r2Key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    const updated = await db.update(documents).set({
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        updatedAt: new Date(),
    }).where(eq(documents.id, documentId)).returning().then((rows) => rows[0]);
    return c.json({ document: updated });
});

// Reader routes below require only sign-in (any authenticated user), matching
// the "any authenticated user can read documents linked from a Page" rule.
// Drafts stay hidden from non-editors even if a link leaks into a public page.
app.get('/api/documents/:documentId', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const documentId = Number(c.req.param('documentId'));
    if (!Number.isInteger(documentId)) return c.json({ error: 'Document not found.' }, 404);
    const document = await db.select().from(documents).where(eq(documents.id, documentId)).get();
    if (!document || document.folderId === null) return c.json({ error: 'Document not found.' }, 404);

    const user = c.get('user') as { isPageEditor?: boolean; isAdmin?: boolean; isOwner?: boolean };
    const isEditor = Boolean(user.isPageEditor || user.isAdmin || user.isOwner);
    if (document.isDraft && !isEditor) return c.json({ error: 'Document not found.' }, 404);

    return c.json({
        id: document.id,
        name: documentDisplayName(document),
        description: document.description,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        url: `/api/files/${document.r2Key}`,
    });
});

app.get('/api/documents/folder/:folderId', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const folderId = Number(c.req.param('folderId'));
    if (!Number.isInteger(folderId)) return c.json({ error: 'Folder not found.' }, 404);
    const folder = await db.select().from(documentFolders).where(eq(documentFolders.id, folderId)).get();
    if (!folder) return c.json({ error: 'Folder not found.' }, 404);

    const user = c.get('user') as { isPageEditor?: boolean; isAdmin?: boolean; isOwner?: boolean };
    const isEditor = Boolean(user.isPageEditor || user.isAdmin || user.isOwner);
    const rows = await db.select().from(documents)
        .where(isEditor ? eq(documents.folderId, folderId) : and(eq(documents.folderId, folderId), eq(documents.isDraft, false)))
        .orderBy(asc(documents.filename)).all();

    return c.json({
        folder: { id: folder.id, name: folder.name, description: folder.description },
        documents: rows.map((document) => ({
            id: document.id,
            name: documentDisplayName(document),
            mimeType: document.mimeType,
            sizeBytes: document.sizeBytes,
        })),
    });
});

// ==========================================
// Photo Gallery (Folders -> Events -> Photos) — page editor role required to manage
// ==========================================

const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTO_ORIGINAL_BYTES = 20 * 1024 * 1024;
const MAX_PHOTO_VARIANT_BYTES = 5 * 1024 * 1024;

async function uniquePhotoFolderSlug(db: PagesDb, name: string, excludeId?: number): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    for (let suffix = 2; ; suffix++) {
        const existing = await db.select({ id: photoFolders.id }).from(photoFolders).where(eq(photoFolders.slug, candidate)).get();
        if (!existing || existing.id === excludeId) return candidate;
        candidate = `${base}-${suffix}`;
    }
}

async function uniquePhotoEventSlug(db: PagesDb, name: string, excludeId?: number): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    for (let suffix = 2; ; suffix++) {
        const existing = await db.select({ id: photoEvents.id }).from(photoEvents).where(eq(photoEvents.slug, candidate)).get();
        if (!existing || existing.id === excludeId) return candidate;
        candidate = `${base}-${suffix}`;
    }
}

// Same visibility rule as pages: drafts are editor-only, non-public events need a matched directory record.
function canViewEvent(
    event: { isDraft: boolean | null; isPublic: boolean | null },
    user: { residentId?: number | null; isPageEditor?: boolean; isAdmin?: boolean; isOwner?: boolean }
): boolean {
    const isEditor = Boolean(user.isPageEditor || user.isAdmin || user.isOwner);
    if (event.isDraft && !isEditor) return false;
    if (!event.isDraft && !event.isPublic && !user.residentId && !isEditor) return false;
    return true;
}

async function deletePhotosR2(bucket: R2Bucket, rows: Array<{ r2Key: string; r2ThumbKey: string; r2DisplayKey: string }>): Promise<void> {
    const keys = rows.flatMap((row) => [row.r2Key, row.r2ThumbKey, row.r2DisplayKey]);
    await Promise.all(keys.map((key) => bucket.delete(key)));
}

app.get('/api/admin/photo-folders', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const folders = await db.select().from(photoFolders).orderBy(asc(photoFolders.displayOrder), asc(photoFolders.id)).all();
    const eventCounts = await db.select({ folderId: photoEvents.folderId, count: sql<number>`count(*)` })
        .from(photoEvents).groupBy(photoEvents.folderId).all();
    const countByFolder = new Map(eventCounts.map((row) => [row.folderId, row.count]));
    return c.json(folders.map((folder) => ({ ...folder, eventCount: countByFolder.get(folder.id) ?? 0 })));
});

app.post('/api/admin/photo-folders', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const body = await c.req.json<{ name?: string }>().catch(() => ({ name: undefined }));
    const name = body.name?.trim();
    if (!name) return c.json({ error: 'Folder name is required.' }, 400);
    const slug = await uniquePhotoFolderSlug(db, name);
    const maxOrder = await db.select({ max: sql<number | null>`max(display_order)` }).from(photoFolders).get();
    const created = await db.insert(photoFolders).values({
        name,
        slug,
        displayOrder: (maxOrder?.max ?? -1) + 1,
    }).returning().then((rows) => rows[0]);
    return c.json({ folder: created }, 201);
});

app.put('/api/admin/photo-folders/:folderId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const folderId = Number(c.req.param('folderId'));
    if (!Number.isInteger(folderId)) return c.json({ error: 'Invalid folder ID.' }, 400);
    const existing = await db.select({ id: photoFolders.id }).from(photoFolders).where(eq(photoFolders.id, folderId)).get();
    if (!existing) return c.json({ error: 'Folder not found.' }, 404);

    const body = await c.req.json<{ name?: string }>();
    const name = body.name?.trim();
    if (!name) return c.json({ error: 'Folder name is required.' }, 400);
    const slug = await uniquePhotoFolderSlug(db, name, folderId);
    const updated = await db.update(photoFolders).set({ name, slug, updatedAt: new Date() })
        .where(eq(photoFolders.id, folderId)).returning().then((rows) => rows[0]);
    return c.json({ folder: updated });
});

app.post('/api/admin/photo-folders/reorder', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const body = await c.req.json<{ folderIds?: number[] }>().catch(() => ({ folderIds: undefined }));
    const folderIds = body.folderIds;
    if (!Array.isArray(folderIds) || folderIds.some((id) => !Number.isInteger(id))) {
        return c.json({ error: 'folderIds must be an array of folder IDs.' }, 400);
    }
    await Promise.all(folderIds.map((id, index) =>
        db.update(photoFolders).set({ displayOrder: index }).where(eq(photoFolders.id, id))));
    return c.json({ reordered: true });
});

app.delete('/api/admin/photo-folders/:folderId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const folderId = Number(c.req.param('folderId'));
    if (!Number.isInteger(folderId)) return c.json({ error: 'Invalid folder ID.' }, 400);
    const existing = await db.select({ id: photoFolders.id }).from(photoFolders).where(eq(photoFolders.id, folderId)).get();
    if (!existing) return c.json({ error: 'Folder not found.' }, 404);

    const eventRows = await db.select({ id: photoEvents.id }).from(photoEvents).where(eq(photoEvents.folderId, folderId)).all();
    const eventIds = eventRows.map((row) => row.id);
    if (eventIds.length) {
        const photoRows = await db.select({ r2Key: photos.r2Key, r2ThumbKey: photos.r2ThumbKey, r2DisplayKey: photos.r2DisplayKey })
            .from(photos).where(inArray(photos.eventId, eventIds)).all();
        await deletePhotosR2(c.env.BUCKET, photoRows);
        await db.delete(photos).where(inArray(photos.eventId, eventIds));
        await db.delete(photoEvents).where(eq(photoEvents.folderId, folderId));
    }
    await db.delete(photoFolders).where(eq(photoFolders.id, folderId));
    return c.json({ deleted: true });
});

app.get('/api/admin/photo-folders/:folderId/events', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const folderId = Number(c.req.param('folderId'));
    if (!Number.isInteger(folderId)) return c.json({ error: 'Invalid folder ID.' }, 400);
    const events = await db.select().from(photoEvents).where(eq(photoEvents.folderId, folderId))
        .orderBy(asc(photoEvents.displayOrder), asc(photoEvents.id)).all();
    const photoCounts = await db.select({ eventId: photos.eventId, count: sql<number>`count(*)` })
        .from(photos).groupBy(photos.eventId).all();
    const countByEvent = new Map(photoCounts.map((row) => [row.eventId, row.count]));
    return c.json(events.map((event) => ({ ...event, photoCount: countByEvent.get(event.id) ?? 0 })));
});

app.get('/api/admin/photo-events/:eventId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const eventId = Number(c.req.param('eventId'));
    if (!Number.isInteger(eventId)) return c.json({ error: 'Invalid event ID.' }, 400);
    const event = await db.select().from(photoEvents).where(eq(photoEvents.id, eventId)).get();
    if (!event) return c.json({ error: 'Event not found.' }, 404);
    return c.json({ event });
});

app.post('/api/admin/photo-events', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const body = await c.req.json<{ folderId?: number; name?: string; description?: string; eventDate?: string }>()
        .catch(() => ({} as Record<string, never>));
    const folderId = Number(body.folderId);
    const name = body.name?.trim();
    if (!Number.isInteger(folderId)) return c.json({ error: 'A folder is required.' }, 400);
    if (!name) return c.json({ error: 'Event name is required.' }, 400);
    const folder = await db.select({ id: photoFolders.id }).from(photoFolders).where(eq(photoFolders.id, folderId)).get();
    if (!folder) return c.json({ error: 'Folder not found.' }, 404);

    const slug = await uniquePhotoEventSlug(db, name);
    const maxOrder = await db.select({ max: sql<number | null>`max(display_order)` }).from(photoEvents).where(eq(photoEvents.folderId, folderId)).get();
    const created = await db.insert(photoEvents).values({
        folderId,
        name,
        slug,
        description: body.description?.trim() || null,
        eventDate: body.eventDate ? new Date(body.eventDate) : null,
        isDraft: true,
        isPublic: true,
        displayOrder: (maxOrder?.max ?? -1) + 1,
    }).returning().then((rows) => rows[0]);
    return c.json({ event: created }, 201);
});

app.put('/api/admin/photo-events/:eventId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const eventId = Number(c.req.param('eventId'));
    if (!Number.isInteger(eventId)) return c.json({ error: 'Invalid event ID.' }, 400);
    const existing = await db.select().from(photoEvents).where(eq(photoEvents.id, eventId)).get();
    if (!existing) return c.json({ error: 'Event not found.' }, 404);

    const body = await c.req.json<{
        folderId?: number; name?: string; description?: string; eventDate?: string | null;
        isPublic?: boolean; isDraft?: boolean;
    }>();
    const name = body.name?.trim();
    if (!name) return c.json({ error: 'Event name is required.' }, 400);
    const folderId = Number(body.folderId ?? existing.folderId);
    if (folderId !== existing.folderId) {
        const folder = await db.select({ id: photoFolders.id }).from(photoFolders).where(eq(photoFolders.id, folderId)).get();
        if (!folder) return c.json({ error: 'Folder not found.' }, 404);
    }
    const slug = await uniquePhotoEventSlug(db, name, eventId);

    const updated = await db.update(photoEvents).set({
        folderId,
        name,
        slug,
        description: body.description?.trim() || null,
        eventDate: body.eventDate ? new Date(body.eventDate) : null,
        isPublic: Boolean(body.isPublic),
        isDraft: Boolean(body.isDraft),
        updatedAt: new Date(),
    }).where(eq(photoEvents.id, eventId)).returning().then((rows) => rows[0]);
    return c.json({ event: updated });
});

app.delete('/api/admin/photo-events/:eventId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const eventId = Number(c.req.param('eventId'));
    if (!Number.isInteger(eventId)) return c.json({ error: 'Invalid event ID.' }, 400);
    const existing = await db.select({ id: photoEvents.id }).from(photoEvents).where(eq(photoEvents.id, eventId)).get();
    if (!existing) return c.json({ error: 'Event not found.' }, 404);

    const photoRows = await db.select({ r2Key: photos.r2Key, r2ThumbKey: photos.r2ThumbKey, r2DisplayKey: photos.r2DisplayKey })
        .from(photos).where(eq(photos.eventId, eventId)).all();
    await deletePhotosR2(c.env.BUCKET, photoRows);
    await db.delete(photos).where(eq(photos.eventId, eventId));
    await db.delete(photoEvents).where(eq(photoEvents.id, eventId));
    return c.json({ deleted: true });
});

app.get('/api/admin/photo-events/:eventId/photos', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const eventId = Number(c.req.param('eventId'));
    if (!Number.isInteger(eventId)) return c.json({ error: 'Invalid event ID.' }, 400);
    const rows = await db.select().from(photos).where(eq(photos.eventId, eventId))
        .orderBy(asc(photos.displayOrder), asc(photos.id)).all();
    return c.json(rows);
});

app.post('/api/admin/photo-events/:eventId/photos', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { id: number };
    const eventId = Number(c.req.param('eventId'));
    if (!Number.isInteger(eventId)) return c.json({ error: 'Invalid event ID.' }, 400);
    const event = await db.select({ id: photoEvents.id, coverPhotoId: photoEvents.coverPhotoId }).from(photoEvents).where(eq(photoEvents.id, eventId)).get();
    if (!event) return c.json({ error: 'Event not found.' }, 404);

    const formData = await c.req.parseBody();
    const original = formData['original'];
    const thumb = formData['thumb'];
    const display = formData['display'];
    const width = Number(formData['width']);
    const height = Number(formData['height']);
    const caption = typeof formData['caption'] === 'string' ? formData['caption'].trim() || null : null;

    if (!(original instanceof File) || !(thumb instanceof File) || !(display instanceof File)) {
        return c.json({ error: 'original, thumb, and display images are all required.' }, 400);
    }
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return c.json({ error: 'Valid image width and height are required.' }, 400);
    }
    for (const [file, maxBytes] of [[original, MAX_PHOTO_ORIGINAL_BYTES], [thumb, MAX_PHOTO_VARIANT_BYTES], [display, MAX_PHOTO_VARIANT_BYTES]] as const) {
        if (!PHOTO_MIME_TYPES.has(file.type)) return c.json({ error: `"${file.name}" is not a supported image type.` }, 415);
        if (file.size > maxBytes) return c.json({ error: `"${file.name}" is too large.` }, 413);
    }

    const photoId = crypto.randomUUID();
    const r2Key = `photos/${photoId}/original.${original.type.split('/')[1]}`;
    // thumb/display arrive as webp, or jpeg if the browser's canvas couldn't encode webp.
    const r2ThumbKey = `photos/${photoId}/thumb.${thumb.type.split('/')[1]}`;
    const r2DisplayKey = `photos/${photoId}/display.${display.type.split('/')[1]}`;
    await Promise.all([
        c.env.BUCKET.put(r2Key, await original.arrayBuffer(), { httpMetadata: { contentType: original.type } }),
        c.env.BUCKET.put(r2ThumbKey, await thumb.arrayBuffer(), { httpMetadata: { contentType: thumb.type } }),
        c.env.BUCKET.put(r2DisplayKey, await display.arrayBuffer(), { httpMetadata: { contentType: display.type } }),
    ]);

    const maxOrder = await db.select({ max: sql<number | null>`max(display_order)` }).from(photos).where(eq(photos.eventId, eventId)).get();
    const created = await db.insert(photos).values({
        eventId,
        r2Key,
        r2ThumbKey,
        r2DisplayKey,
        caption,
        width: Math.round(width),
        height: Math.round(height),
        displayOrder: (maxOrder?.max ?? -1) + 1,
        uploadedByUserId: user.id,
    }).returning().then((rows) => rows[0]);

    if (!event.coverPhotoId) {
        await db.update(photoEvents).set({ coverPhotoId: created!.id }).where(eq(photoEvents.id, eventId));
    }
    return c.json({ photo: created }, 201);
});

app.put('/api/admin/photos/:photoId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const photoId = Number(c.req.param('photoId'));
    if (!Number.isInteger(photoId)) return c.json({ error: 'Invalid photo ID.' }, 400);
    const existing = await db.select({ id: photos.id }).from(photos).where(eq(photos.id, photoId)).get();
    if (!existing) return c.json({ error: 'Photo not found.' }, 404);

    const body = await c.req.json<{ caption?: string }>();
    const updated = await db.update(photos).set({ caption: body.caption?.trim() || null })
        .where(eq(photos.id, photoId)).returning().then((rows) => rows[0]);
    return c.json({ photo: updated });
});

app.delete('/api/admin/photos/:photoId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const photoId = Number(c.req.param('photoId'));
    if (!Number.isInteger(photoId)) return c.json({ error: 'Invalid photo ID.' }, 400);
    const existing = await db.select().from(photos).where(eq(photos.id, photoId)).get();
    if (!existing) return c.json({ error: 'Photo not found.' }, 404);

    await deletePhotosR2(c.env.BUCKET, [existing]);
    await db.delete(photos).where(eq(photos.id, photoId));
    await db.update(photoEvents).set({ coverPhotoId: null })
        .where(and(eq(photoEvents.id, existing.eventId), eq(photoEvents.coverPhotoId, photoId)));
    return c.json({ deleted: true });
});

app.post('/api/admin/photo-events/:eventId/photos/reorder', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const eventId = Number(c.req.param('eventId'));
    if (!Number.isInteger(eventId)) return c.json({ error: 'Invalid event ID.' }, 400);
    const body = await c.req.json<{ photoIds?: number[] }>().catch(() => ({ photoIds: undefined }));
    const photoIds = body.photoIds;
    if (!Array.isArray(photoIds) || photoIds.some((id) => !Number.isInteger(id))) {
        return c.json({ error: 'photoIds must be an array of photo IDs.' }, 400);
    }
    await Promise.all(photoIds.map((id, index) =>
        db.update(photos).set({ displayOrder: index }).where(and(eq(photos.id, id), eq(photos.eventId, eventId)))));
    return c.json({ reordered: true });
});

app.post('/api/admin/photo-events/:eventId/cover', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const eventId = Number(c.req.param('eventId'));
    if (!Number.isInteger(eventId)) return c.json({ error: 'Invalid event ID.' }, 400);
    const body = await c.req.json<{ photoId?: number }>().catch(() => ({ photoId: undefined }));
    const photoId = Number(body.photoId);
    if (!Number.isInteger(photoId)) return c.json({ error: 'A photo ID is required.' }, 400);
    const photo = await db.select({ id: photos.id }).from(photos).where(and(eq(photos.id, photoId), eq(photos.eventId, eventId))).get();
    if (!photo) return c.json({ error: 'Photo not found in this event.' }, 404);
    await db.update(photoEvents).set({ coverPhotoId: photoId }).where(eq(photoEvents.id, eventId));
    return c.json({ coverPhotoId: photoId });
});

// Public gallery listing — same visibility rule as pages (see canViewEvent).
app.get('/api/gallery', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { residentId?: number | null; isPageEditor?: boolean; isAdmin?: boolean; isOwner?: boolean };
    const folders = await db.select().from(photoFolders).orderBy(asc(photoFolders.displayOrder), asc(photoFolders.id)).all();
    const events = await db.select().from(photoEvents).orderBy(asc(photoEvents.displayOrder), asc(photoEvents.id)).all();
    const visibleEvents = events.filter((event) => canViewEvent(event, user));
    const eventsByFolder = new Map<number, typeof visibleEvents>();
    for (const event of visibleEvents) {
        const bucket = eventsByFolder.get(event.folderId) ?? [];
        bucket.push(event);
        eventsByFolder.set(event.folderId, bucket);
    }
    const result = folders
        .map((folder) => ({
            id: folder.id,
            name: folder.name,
            slug: folder.slug,
            events: (eventsByFolder.get(folder.id) ?? []).map((event) => ({
                id: event.id,
                name: event.name,
                slug: event.slug,
                eventDate: event.eventDate,
                isDraft: event.isDraft,
                coverPhotoId: event.coverPhotoId,
            })),
        }))
        .filter((folder) => folder.events.length > 0);
    return c.json(result);
});

app.get('/api/gallery/folder/:folderSlug', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { residentId?: number | null; isPageEditor?: boolean; isAdmin?: boolean; isOwner?: boolean };
    const folder = await db.select().from(photoFolders).where(eq(photoFolders.slug, c.req.param('folderSlug'))).get();
    if (!folder) return c.json({ error: 'Folder not found.' }, 404);

    const events = await db.select().from(photoEvents).where(eq(photoEvents.folderId, folder.id))
        .orderBy(asc(photoEvents.displayOrder), asc(photoEvents.id)).all();
    const visibleEvents = events.filter((event) => canViewEvent(event, user)).map((event) => ({
        id: event.id,
        name: event.name,
        slug: event.slug,
        eventDate: event.eventDate,
        isDraft: event.isDraft,
        coverPhotoId: event.coverPhotoId,
    }));
    return c.json({ folder: { id: folder.id, name: folder.name, slug: folder.slug }, events: visibleEvents });
});

app.get('/api/gallery/:eventSlug', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { residentId?: number | null; isPageEditor?: boolean; isAdmin?: boolean; isOwner?: boolean };
    const event = await db.select().from(photoEvents).where(eq(photoEvents.slug, c.req.param('eventSlug'))).get();
    if (!event) return c.json({ error: 'Event not found.' }, 404);
    if (!canViewEvent(event, user)) return c.json({ error: 'Event not found.' }, 404);

    const photoRows = await db.select({
        id: photos.id,
        caption: photos.caption,
        width: photos.width,
        height: photos.height,
        displayOrder: photos.displayOrder,
    }).from(photos).where(eq(photos.eventId, event.id)).orderBy(asc(photos.displayOrder), asc(photos.id)).all();

    return c.json({ event, photos: photoRows });
});

// Authenticated photo variant proxy — same directory/draft visibility rule as the gallery API.
app.get('/api/photos/:photoId/:variant', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const user = c.get('user') as { residentId?: number | null; isPageEditor?: boolean; isAdmin?: boolean; isOwner?: boolean };
    const photoId = Number(c.req.param('photoId'));
    const variant = c.req.param('variant');
    if (!Number.isInteger(photoId)) return c.json({ error: 'Photo not found.' }, 404);
    if (!['thumb', 'display', 'original'].includes(variant)) return c.json({ error: 'Invalid image variant.' }, 400);

    const photo = await db.select().from(photos).where(eq(photos.id, photoId)).get();
    if (!photo) return c.json({ error: 'Photo not found.' }, 404);
    const event = await db.select().from(photoEvents).where(eq(photoEvents.id, photo.eventId)).get();
    if (!event || !canViewEvent(event, user)) return c.json({ error: 'Photo not found.' }, 404);

    const key = variant === 'thumb' ? photo.r2ThumbKey : variant === 'display' ? photo.r2DisplayKey : photo.r2Key;
    const object = await c.env.BUCKET.get(key);
    if (!object) return c.json({ error: 'File not found.' }, 404);
    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream');
    // R2 keys are immutable UUIDs — safe to cache for a year, per photos.md.
    headers.set('Cache-Control', 'private, max-age=31536000, immutable');
    headers.set('ETag', object.httpEtag);
    return new Response(object.body, { headers });
});

// ==========================================
// Menus (navigation) — page editor role required to manage
// ==========================================

const MAX_MENU_DEPTH = 3;

type MenuRow = typeof menus.$inferSelect;

async function uniqueMenuSlug(db: PagesDb, title: string, excludeId?: number): Promise<string> {
    const base = slugify(title);
    let candidate = base;
    for (let suffix = 2; ; suffix++) {
        const existing = await db.select({ id: menus.id }).from(menus).where(eq(menus.slug, candidate)).get();
        if (!existing || existing.id === excludeId) return candidate;
        candidate = `${base}-${suffix}`;
    }
}

function loadMenuRows(db: PagesDb) {
    return db.select().from(menus).orderBy(asc(menus.displayOrder), asc(menus.id)).all();
}

// Depth of a node whose parent is parentId (root children are depth 1).
function depthOfParent(parentById: Map<number, number | null>, parentId: number | null): number {
    let depth = 1;
    let cursor = parentId;
    const seen = new Set<number>();
    while (cursor !== null && cursor !== undefined) {
        if (seen.has(cursor)) return Number.POSITIVE_INFINITY;
        seen.add(cursor);
        depth += 1;
        cursor = parentById.get(cursor) ?? null;
    }
    return depth;
}

function subtreeHeight(childrenByParent: Map<number | null, number[]>, id: number): number {
    const kids = childrenByParent.get(id) ?? [];
    if (!kids.length) return 1;
    return 1 + Math.max(...kids.map((kid) => subtreeHeight(childrenByParent, kid)));
}

function buildChildIndex(rows: Array<{ id: number; parentId: number | null }>): Map<number | null, number[]> {
    const index = new Map<number | null, number[]>();
    for (const row of rows) {
        const bucket = index.get(row.parentId) ?? [];
        bucket.push(row.id);
        index.set(row.parentId, bucket);
    }
    return index;
}

function collectDescendantIds(childrenByParent: Map<number | null, number[]>, id: number): number[] {
    const result: number[] = [];
    const queue = [...(childrenByParent.get(id) ?? [])];
    while (queue.length) {
        const current = queue.shift()!;
        result.push(current);
        queue.push(...(childrenByParent.get(current) ?? []));
    }
    return result;
}

function normalizeMenuTarget(kind: string, pageId: unknown, targetUrl: unknown) {
    if (kind === 'page') return { pageId: Number(pageId), targetUrl: null };
    if (kind === 'link') return { pageId: null, targetUrl: String(targetUrl ?? '').trim() };
    return { pageId: null, targetUrl: null };
}

app.get('/api/admin/menus', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db.select({
        id: menus.id,
        parentId: menus.parentId,
        kind: menus.kind,
        slug: menus.slug,
        title: menus.title,
        description: menus.description,
        iconName: menus.iconName,
        pageId: menus.pageId,
        targetUrl: menus.targetUrl,
        openInNewTab: menus.openInNewTab,
        displayOrder: menus.displayOrder,
        isPublic: menus.isPublic,
        isDraft: menus.isDraft,
        updatedAt: menus.updatedAt,
        pageTitle: pages.title,
        pageSlug: pages.slug,
        pageIsDraft: pages.isDraft,
        pageIsPublic: pages.isPublic,
    }).from(menus).leftJoin(pages, eq(pages.id, menus.pageId))
        .orderBy(asc(menus.displayOrder), asc(menus.id)).all();
    return c.json(rows);
});

app.post('/api/admin/menus', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const body = await c.req.json<{
        kind?: 'menu' | 'page' | 'link';
        title?: string;
        parentId?: number | null;
        pageId?: number | null;
        targetUrl?: string | null;
        openInNewTab?: boolean;
        description?: string | null;
        iconName?: string | null;
        position?: 'start' | 'end';
    }>().catch(() => ({}) as {
        kind?: 'menu' | 'page' | 'link';
        title?: string;
        parentId?: number | null;
        pageId?: number | null;
        targetUrl?: string | null;
        openInNewTab?: boolean;
        description?: string | null;
        iconName?: string | null;
        position?: 'start' | 'end';
    });

    const kind = body.kind ?? 'menu';
    if (!['menu', 'page', 'link'].includes(kind)) return c.json({ error: 'Invalid menu kind.' }, 400);

    const rows = await loadMenuRows(db);
    const parentById = new Map<number, number | null>(rows.map((row) => [row.id, row.parentId]));

    const parentId = body.parentId ?? null;
    if (parentId !== null) {
        const parent = rows.find((row) => row.id === parentId);
        if (!parent) return c.json({ error: 'Parent menu not found.' }, 400);
        if (parent.kind !== 'menu') return c.json({ error: 'Only folders can contain items.' }, 400);
    }
    if (depthOfParent(parentById, parentId) > MAX_MENU_DEPTH) {
        return c.json({ error: `Menus can only be nested ${MAX_MENU_DEPTH} levels deep.` }, 400);
    }

    let title = body.title?.trim() ?? '';
    const target = normalizeMenuTarget(kind, body.pageId, body.targetUrl);

    if (kind === 'page') {
        if (!Number.isInteger(target.pageId)) return c.json({ error: 'A page is required.' }, 400);
        const page = await db.select({ id: pages.id, title: pages.title }).from(pages).where(eq(pages.id, target.pageId!)).get();
        if (!page) return c.json({ error: 'Page not found.' }, 400);
        if (!title) title = page.title;
    }
    if (kind === 'link' && !target.targetUrl) return c.json({ error: 'A link URL is required.' }, 400);
    if (!title) title = kind === 'link' ? 'New link' : 'New menu';

    const siblings = rows.filter((row) => row.parentId === parentId);
    const displayOrder = siblings.length
        ? (body.position === 'start'
            ? Math.min(...siblings.map((row) => row.displayOrder ?? 0)) - 1
            : Math.max(...siblings.map((row) => row.displayOrder ?? 0)) + 1)
        : 0;

    const created = await db.insert(menus).values({
        parentId,
        kind,
        slug: kind === 'menu' ? await uniqueMenuSlug(db, title) : null,
        title,
        description: body.description?.trim() || null,
        iconName: body.iconName?.trim() || null,
        pageId: target.pageId,
        targetUrl: target.targetUrl,
        openInNewTab: kind === 'link' ? (body.openInNewTab ?? true) : true,
        displayOrder,
        isPublic: false,
        isDraft: true,
    }).returning().then((inserted) => inserted[0]);

    return c.json({ menu: created }, 201);
});

// Batch reparent/reorder — the drag-and-drop save. Sends the whole tree so the
// server can reject cycles and over-deep nesting before anything is written.
// Registered before /:menuId so the literal path wins.
app.put('/api/admin/menus/reorder', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const body = await c.req.json<{ items?: Array<{ id?: number; parentId?: number | null; displayOrder?: number }> }>().catch(() => ({}) as { items?: Array<{ id?: number; parentId?: number | null; displayOrder?: number }> });
    const items = body.items ?? [];
    if (!items.length) return c.json({ error: 'No items supplied.' }, 400);

    const rows = await loadMenuRows(db);
    const kindById = new Map(rows.map((row) => [row.id, row.kind]));
    const seen = new Set<number>();
    const nextParent = new Map<number, number | null>();

    for (const item of items) {
        const id = Number(item.id);
        if (!Number.isInteger(id) || !kindById.has(id)) return c.json({ error: 'Unknown menu in payload.' }, 400);
        if (seen.has(id)) return c.json({ error: 'Duplicate menu in payload.' }, 400);
        seen.add(id);

        const parentId = item.parentId ?? null;
        if (parentId !== null) {
            if (!kindById.has(parentId)) return c.json({ error: 'Unknown parent in payload.' }, 400);
            if (kindById.get(parentId) !== 'menu') return c.json({ error: 'Only folders can contain items.' }, 400);
        }
        nextParent.set(id, parentId);
    }
    if (seen.size !== rows.length) return c.json({ error: 'Payload must contain every menu.' }, 400);

    const nextRows = [...nextParent.entries()].map(([id, parentId]) => ({ id, parentId }));
    const childIndex = buildChildIndex(nextRows);
    for (const { id, parentId } of nextRows) {
        const depth = depthOfParent(nextParent, parentId);
        if (!Number.isFinite(depth)) return c.json({ error: 'Menus cannot contain themselves.' }, 400);
        if (depth + subtreeHeight(childIndex, id) - 1 > MAX_MENU_DEPTH) {
            return c.json({ error: `Menus can only be nested ${MAX_MENU_DEPTH} levels deep.` }, 400);
        }
    }

    const now = new Date();
    const statements = items.map((item, index) => db.update(menus).set({
        parentId: item.parentId ?? null,
        displayOrder: item.displayOrder ?? index,
        updatedAt: now,
    }).where(eq(menus.id, Number(item.id))));
    await db.batch(statements as [typeof statements[number], ...typeof statements]);

    return c.json({ saved: true, savedAt: now.toISOString() });
});

app.put('/api/admin/menus/:menuId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const menuId = Number(c.req.param('menuId'));
    if (!Number.isInteger(menuId)) return c.json({ error: 'Invalid menu ID.' }, 400);
    const existing = await db.select().from(menus).where(eq(menus.id, menuId)).get();
    if (!existing) return c.json({ error: 'Menu not found.' }, 404);

    const body = await c.req.json<{
        title?: string;
        slug?: string | null;
        description?: string | null;
        iconName?: string | null;
        pageId?: number | null;
        targetUrl?: string | null;
        openInNewTab?: boolean;
        isPublic?: boolean;
        isDraft?: boolean;
    }>();

    const title = body.title?.trim() ?? '';
    if (!title) return c.json({ error: 'Title is required.' }, 400);

    let slug = existing.slug;
    if (existing.kind === 'menu') {
        const requested = body.slug?.trim() ?? '';
        if (requested) {
            if (!SLUG_PATTERN.test(requested)) return c.json({ error: 'Slug must be lowercase letters, numbers, and hyphens.' }, 400);
            const conflict = await db.select({ id: menus.id }).from(menus).where(eq(menus.slug, requested)).get();
            if (conflict && conflict.id !== menuId) return c.json({ error: 'Another menu already uses this slug.' }, 409);
            slug = requested;
        } else {
            slug = await uniqueMenuSlug(db, title, menuId);
        }
    }

    const target = normalizeMenuTarget(existing.kind, body.pageId ?? existing.pageId, body.targetUrl ?? existing.targetUrl);
    if (existing.kind === 'page') {
        if (!Number.isInteger(target.pageId)) return c.json({ error: 'A page is required.' }, 400);
        const page = await db.select({ id: pages.id }).from(pages).where(eq(pages.id, target.pageId!)).get();
        if (!page) return c.json({ error: 'Page not found.' }, 400);
    }
    if (existing.kind === 'link' && !target.targetUrl) return c.json({ error: 'A link URL is required.' }, 400);

    const updated = await db.update(menus).set({
        title,
        slug,
        description: body.description?.trim() || null,
        iconName: body.iconName?.trim() || null,
        pageId: target.pageId,
        targetUrl: target.targetUrl,
        openInNewTab: existing.kind === 'link' ? (body.openInNewTab ?? Boolean(existing.openInNewTab)) : true,
        isPublic: body.isPublic ?? Boolean(existing.isPublic),
        isDraft: body.isDraft ?? Boolean(existing.isDraft),
        updatedAt: new Date(),
    }).where(eq(menus.id, menuId)).returning().then((rows) => rows[0]);

    return c.json({ menu: updated });
});

app.post('/api/admin/menus/:menuId/publish', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const menuId = Number(c.req.param('menuId'));
    if (!Number.isInteger(menuId)) return c.json({ error: 'Invalid menu ID.' }, 400);
    const existing = await db.select({ id: menus.id }).from(menus).where(eq(menus.id, menuId)).get();
    if (!existing) return c.json({ error: 'Menu not found.' }, 404);

    const body = await c.req.json<{ isDraft?: boolean }>().catch(() => ({}) as { isDraft?: boolean });
    const updated = await db.update(menus).set({
        isDraft: body.isDraft ?? false,
        updatedAt: new Date(),
    }).where(eq(menus.id, menuId)).returning().then((rows) => rows[0]);
    return c.json({ menu: updated });
});

app.delete('/api/admin/menus/:menuId', requireAuth(), requirePageEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const menuId = Number(c.req.param('menuId'));
    if (!Number.isInteger(menuId)) return c.json({ error: 'Invalid menu ID.' }, 400);
    const rows = await loadMenuRows(db);
    if (!rows.some((row) => row.id === menuId)) return c.json({ error: 'Menu not found.' }, 404);

    const descendants = collectDescendantIds(buildChildIndex(rows), menuId);
    const ids = [menuId, ...descendants];
    await db.delete(menus).where(inArray(menus.id, ids));
    return c.json({ deleted: true, removedCount: ids.length });
});

// ==========================================
// Navigation read model — shared by home cards and menu pages
// ==========================================

type Viewer = { residentId?: number | null; isPageEditor?: boolean; isAdmin?: boolean; isOwner?: boolean } | null;

async function resolveViewer(c: { env: AppBindings; req: any }): Promise<Viewer> {
    if (c.env.DEV_BYPASS_AUTH === 'true') return devBypassUser(c.env.DEV_BYPASS_ROLE) as Viewer;
    const rawReq = c.req.raw ?? c.req;
    const rawSession = getCookie(rawReq, SESSION_COOKIE);
    if (!rawSession) return null;
    const authResult = await findUserBySession(drizzle(c.env.DB), rawSession);
    return (authResult?.user as Viewer) ?? null;
}

type NavNode = {
    id: number;
    kind: string;
    slug: string | null;
    title: string;
    description: string | null;
    iconName: string | null;
    pageSlug: string | null;
    targetUrl: string | null;
    openInNewTab: boolean;
    isPublic: boolean;
    isDraft: boolean;
    children: NavNode[];
};

// Drops drafts and anything the viewer may not see, so private titles never
// reach the wire. Editors see the tree as authored.
function buildNavTree(
    rows: Array<MenuRow & { pageSlug: string | null; pageIsDraft: boolean | null; pageIsPublic: boolean | null }>,
    viewer: Viewer,
): NavNode[] {
    const isEditor = Boolean(viewer?.isPageEditor || viewer?.isAdmin || viewer?.isOwner);
    const hasDirectory = Boolean(viewer?.residentId);

    const canSee = (row: (typeof rows)[number]): boolean => {
        if (isEditor) return true;
        if (row.isDraft) return false;
        if (!row.isPublic && !hasDirectory) return false;
        if (row.kind === 'page') {
            if (!row.pageSlug || row.pageIsDraft) return false;
            if (!row.pageIsPublic && !hasDirectory) return false;
        }
        return true;
    };

    const byParent = new Map<number | null, typeof rows>();
    for (const row of rows) {
        const bucket = byParent.get(row.parentId) ?? [];
        bucket.push(row);
        byParent.set(row.parentId, bucket);
    }

    const build = (parentId: number | null): NavNode[] => (byParent.get(parentId) ?? [])
        .filter(canSee)
        .map((row) => ({
            id: row.id,
            kind: row.kind,
            slug: row.slug,
            title: row.title,
            description: row.description,
            iconName: row.iconName,
            pageSlug: row.pageSlug,
            targetUrl: row.targetUrl,
            openInNewTab: Boolean(row.openInNewTab),
            isPublic: Boolean(row.isPublic),
            isDraft: Boolean(row.isDraft),
            children: build(row.id),
        }))
        // A folder with nothing visible inside is a dead end for regular viewers.
        .filter((node) => isEditor || node.kind !== 'menu' || node.children.length > 0);

    return build(null);
}

function navRows(db: PagesDb) {
    return db.select({
        id: menus.id,
        parentId: menus.parentId,
        kind: menus.kind,
        slug: menus.slug,
        title: menus.title,
        description: menus.description,
        iconName: menus.iconName,
        pageId: menus.pageId,
        targetUrl: menus.targetUrl,
        openInNewTab: menus.openInNewTab,
        displayOrder: menus.displayOrder,
        isPublic: menus.isPublic,
        isDraft: menus.isDraft,
        createdAt: menus.createdAt,
        updatedAt: menus.updatedAt,
        pageSlug: pages.slug,
        pageIsDraft: pages.isDraft,
        pageIsPublic: pages.isPublic,
    }).from(menus).leftJoin(pages, eq(pages.id, menus.pageId))
        .orderBy(asc(menus.displayOrder), asc(menus.id)).all();
}

app.get('/api/nav', async (c) => {
    const db = drizzle(c.env.DB);
    const viewer = await resolveViewer(c);
    return c.json({ items: buildNavTree(await navRows(db), viewer) });
});

// Ancestor menu titles for a page, so a page can show its way back home.
function navTrailToPage(tree: NavNode[], pageSlug: string): Array<{ slug: string | null; title: string }> {
    const trail: NavNode[] = [];
    const walk = (nodes: NavNode[]): boolean => {
        for (const node of nodes) {
            trail.push(node);
            if (node.kind === 'page' && node.pageSlug === pageSlug) return true;
            if (walk(node.children)) return true;
            trail.pop();
        }
        return false;
    };
    if (!walk(tree)) return [];
    return trail.slice(0, -1).map((node) => ({ slug: node.slug, title: node.title }));
}

app.get('/api/nav/:slug', async (c) => {
    const db = drizzle(c.env.DB);
    const viewer = await resolveViewer(c);
    const tree = buildNavTree(await navRows(db), viewer);
    const slug = c.req.param('slug');

    const trail: NavNode[] = [];
    const find = (nodes: NavNode[]): NavNode | null => {
        for (const node of nodes) {
            trail.push(node);
            if (node.slug === slug) return node;
            const nested = find(node.children);
            if (nested) return nested;
            trail.pop();
        }
        return null;
    };

    const match = find(tree);
    if (!match) return c.json({ error: 'Menu not found.' }, 404);
    return c.json({
        menu: { id: match.id, slug: match.slug, title: match.title, description: match.description, iconName: match.iconName },
        breadcrumbs: trail.slice(0, -1).map((node) => ({ slug: node.slug, title: node.title })),
        items: match.children,
    });
});

// Public page view — editors may view drafts; public pages for any signed-in user;
// non-public published pages require directory access.
app.get('/api/pages/:slug', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const page = await db.select().from(pages).where(eq(pages.slug, c.req.param('slug'))).get();
    if (!page) return c.json({ error: 'Page not found.' }, 404);
    const user = c.get('user') as { residentId?: number | null; isPageEditor?: boolean; isAdmin?: boolean; isOwner?: boolean };
    const isEditor = Boolean(user.isPageEditor || user.isAdmin || user.isOwner);
    if (page.isDraft && !isEditor) return c.json({ error: 'Page not found.' }, 404);
    if (!page.isDraft && !page.isPublic && !user.residentId && !isEditor) {
        return c.json({ error: 'Directory access is required to view this page.' }, 403);
    }
    const breadcrumbs = navTrailToPage(buildNavTree(await navRows(db), user as Viewer), page.slug);
    return c.json({ ...page, breadcrumbs });
});

// Authenticated file proxy for R2 attachments — no public bucket access.
app.get('/api/files/*', requireAuth(), async (c) => {
    const key = decodeURIComponent(c.req.path.slice('/api/files/'.length));
    if (!key) return c.json({ error: 'File not found.' }, 404);
    const object = await c.env.BUCKET.get(key);
    if (!object) return c.json({ error: 'File not found.' }, 404);
    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream');
    headers.set('Cache-Control', 'private, max-age=3600');
    headers.set('ETag', object.httpEtag);
    return new Response(object.body, { headers });
});

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;