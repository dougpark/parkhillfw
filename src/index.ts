import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, like, or, type SQL } from 'drizzle-orm';
import { children, householdFavorites, households, residents } from './db/schema';
import { requireAuth } from './middleware/auth';

type Bindings = {
    DB: D1Database;
    BUCKET: R2Bucket;
    DEV_BYPASS_AUTH?: string;
    JWT_SECRET?: string;
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

app.get('/api/residents', async (c) => {
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

export default app;