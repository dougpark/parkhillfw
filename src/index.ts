import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, asc, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
    accessRequests,
    activityLogs,
    children,
    documents,
    householdFavorites,
    households,
    magicLinkRateLimits,
    magicTokens,
    menus,
    pages,
    residents,
    sessions,
    userLoginEmails,
    users,
} from './db/schema';
import { approvalLinkLifetimeMinutes, completeLogin, createMagicLinkToken, expiredSessionCookie, findUserBySession, hashToken, normalizeEmail, sessionCookie, SESSION_COOKIE, verifyCodeAndConsume } from './lib/auth';
import { sendAccessRequestOutcomeEmail, sendMagicLinkEmail } from './lib/email';
import { devBypassUser, getCookie, isOwner as hasOwner, requireAdmin, requireAnyAdminRole, requireAuth, requireDirectory, requireDirectoryEditor, requirePageEditor, type AppBindings, type AppEnv } from './middleware/auth';

const app = new Hono<AppEnv>();

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
        await sendMagicLinkEmail(c.env.EMAIL, email, token.rawToken, token.rawCode, new URL(c.req.url).origin);
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
    const [householdCount, residentCount, childCount, userCount, aliasLoginCount, openAccessRequestCount] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(households).get(),
        db.select({ count: sql<number>`count(*)` }).from(residents).get(),
        db.select({ count: sql<number>`count(*)` }).from(children).get(),
        db.select({ count: sql<number>`count(*)` }).from(users).get(),
        db.select({ count: sql<number>`count(*)` }).from(userLoginEmails).get(),
        db.select({ count: sql<number>`count(*)` }).from(accessRequests).where(eq(accessRequests.status, 'pending')).get(),
    ]);

    return c.json({
        households: householdCount?.count ?? 0,
        adultResidents: residentCount?.count ?? 0,
        children: childCount?.count ?? 0,
        loginAccounts: userCount?.count ?? 0,
        aliasLogins: aliasLoginCount?.count ?? 0,
        openAccessRequests: openAccessRequestCount?.count ?? 0,
    });
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

app.post('/api/admin/households/:householdId/vacate', requireAuth(), requireDirectoryEditor(), async (c) => {
    const db = drizzle(c.env.DB);
    const householdId = Number(c.req.param('householdId'));
    if (!Number.isInteger(householdId)) return c.json({ error: 'Invalid household ID.' }, 400);

    const household = await db.select({ id: households.id, streetAddress: households.streetAddress })
        .from(households).where(eq(households.id, householdId)).get();
    if (!household) return c.json({ error: 'Household not found.' }, 404);

    const householdResidents = await db.select({ id: residents.id, email: residents.email })
        .from(residents).where(eq(residents.householdId, householdId)).all();
    const residentIds = householdResidents.map((resident) => resident.id);
    const residentEmails = householdResidents.flatMap((resident) => resident.email ? [normalizeEmail(resident.email)] : []);
    const linkedUsers = residentIds.length
        ? await db.select({ id: users.id }).from(users).where(inArray(users.residentId, residentIds)).all()
        : [];
    const userIds = linkedUsers.map((user) => user.id);
    if (residentEmails.length) await db.delete(magicTokens).where(inArray(magicTokens.email, residentEmails));

    if (userIds.length) {
        const linkedUserEmails = await db.select({ email: users.email }).from(users).where(inArray(users.id, userIds)).all();
        const linkedLoginEmails = await db.select({ email: userLoginEmails.email }).from(userLoginEmails)
            .where(inArray(userLoginEmails.userId, userIds)).all();
        const authEmails = [...new Set([
            ...residentEmails,
            ...linkedUserEmails.map((item) => normalizeEmail(item.email)),
            ...linkedLoginEmails.map((item) => normalizeEmail(item.email)),
        ])];
        if (authEmails.length) await db.delete(magicTokens).where(inArray(magicTokens.email, authEmails));
        await db.delete(sessions).where(inArray(sessions.userId, userIds));
        await db.delete(userLoginEmails).where(inArray(userLoginEmails.userId, userIds));
        await db.update(users).set({ residentId: null, linkStatus: 'unlinked', updatedAt: new Date() })
            .where(inArray(users.id, userIds));
    }
    await db.delete(householdFavorites).where(eq(householdFavorites.householdId, householdId));
    await db.delete(children).where(eq(children.householdId, householdId));
    await db.delete(residents).where(eq(residents.householdId, householdId));
    await db.update(households).set({
        status: 'vacant',
        yearMovedIn: null,
        parkHillMember: null,
        securityMember: false,
        pets: null,
        photoKey: null,
        notes: null,
        updatedAt: new Date(),
    }).where(eq(households.id, householdId));

    return c.json({ cleared: true, streetAddress: household.streetAddress, residentsRemoved: residentIds.length, usersReset: userIds.length });
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

const PERMISSION_FIELDS = ['isOwner', 'isAdmin', 'isPageEditor', 'isDirectoryEditor'] as const;
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
        firstName: residents.firstName,
        lastName: residents.lastName,
    }).from(users)
        .leftJoin(residents, eq(residents.id, users.residentId))
        .where(or(eq(users.isOwner, true), eq(users.isAdmin, true), eq(users.isPageEditor, true), eq(users.isDirectoryEditor, true)))
        .orderBy(asc(users.email)).all();

    return c.json(rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.firstName ? `${row.firstName} ${row.lastName}` : row.email,
        isOwner: row.isOwner,
        isAdmin: row.isAdmin,
        isPageEditor: row.isPageEditor,
        isDirectoryEditor: row.isDirectoryEditor,
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
    };
    await db.update(users).set({ isOwner: false, isAdmin: false, isPageEditor: false, isDirectoryEditor: false }).where(eq(users.id, userId));
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
        await sendMagicLinkEmail(c.env.EMAIL, target.email, token.rawToken, token.rawCode, new URL(c.req.url).origin);
    } catch (error) {
        const emailError = error as { code?: string; message?: string };
        console.error('Admin-triggered magic-link email failed', { code: emailError.code ?? 'UNKNOWN', message: emailError.message ?? 'Unknown email provider error' });
        return c.json({ error: 'We could not send the email right now. Please try again later.' }, 503);
    }
    await logUserManagementChange(db, actor.id, userId, 'magic_link_dispatch', {});

    return c.json({ sent: true });
});

app.get('/api/admin/activity-logs', requireAuth(), requireAdmin(), async (c) => {
    const db = drizzle(c.env.DB);
    const category = c.req.query('category');
    const query = (c.req.query('q') ?? '').trim();
    const limit = Math.min(Number(c.req.query('limit')) || 50, 200);

    const targetUsers = alias(users, 'target_users');
    const conditions: SQL[] = [];
    if (category) conditions.push(eq(activityLogs.category, category as typeof activityLogs.$inferSelect.category));
    if (query) conditions.push(or(like(users.email, `%${query}%`), like(targetUsers.email, `%${query}%`), like(activityLogs.action, `%${query}%`))!);

    const rows = await db.select({
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
        .limit(limit).all();

    return c.json(rows);
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
        await sendAccessRequestOutcomeEmail(c.env.EMAIL, normalizedRequestEmail, reviewStatus, outcomeToken, new URL(c.req.url).origin);
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

    const householdRows = (await db.select().from(households).where(or(eq(households.status, 'active'), eq(households.status, 'vacant'))).all()).sort((left, right) =>
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
        description?: string | null;
        iconName?: string | null;
    }>().catch(() => ({}) as {
        kind?: 'menu' | 'page' | 'link';
        title?: string;
        parentId?: number | null;
        pageId?: number | null;
        targetUrl?: string | null;
        description?: string | null;
        iconName?: string | null;
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
    const displayOrder = siblings.length ? Math.max(...siblings.map((row) => row.displayOrder ?? 0)) + 1 : 0;

    const created = await db.insert(menus).values({
        parentId,
        kind,
        slug: kind === 'menu' ? await uniqueMenuSlug(db, title) : null,
        title,
        description: body.description?.trim() || null,
        iconName: body.iconName?.trim() || null,
        pageId: target.pageId,
        targetUrl: target.targetUrl,
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

async function resolveViewer(c: { env: AppBindings; req: { raw: Request }; header: (name: string, value: string, options?: { append?: boolean }) => void }): Promise<Viewer> {
    if (c.env.DEV_BYPASS_AUTH === 'true') return devBypassUser(c.env.DEV_BYPASS_ROLE) as Viewer;
    const rawSession = getCookie(c.req.raw, SESSION_COOKIE);
    if (!rawSession) return null;
    const authResult = await findUserBySession(drizzle(c.env.DB), rawSession);
    if (authResult?.renewedExpiresAt) {
        const secure = new URL(c.req.url).protocol === 'https:';
        c.header('Set-Cookie', sessionCookie(rawSession, authResult.renewedExpiresAt, secure), { append: true });
    }
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