import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, like, or, type SQL } from 'drizzle-orm';
import { children, households, residents } from './db/schema';
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

    const streetNameOrder = leftMatch[2].localeCompare(rightMatch[2], undefined, { sensitivity: 'base' });
    return streetNameOrder || Number(leftMatch[1]) - Number(rightMatch[1]);
}

app.get('/api/health', (c) => c.json({ status: 'ok', runtime: 'bun-cloudflare' }));

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

    const filters: SQL[] = [];
    if (q) {
        filters.push(
            or(
                like(households.streetAddress, `%${q}%`),
                like(residents.firstName, `%${q}%`),
                like(residents.lastName, `%${q}%`),
                like(residents.email, `%${q}%`),
                like(children.name, `%${q}%`)
            )
        );
    }

    const serviceFilters: SQL[] = [];
    if (petSitting) serviceFilters.push(eq(children.petSitting, true));
    if (babysitting) serviceFilters.push(eq(children.babysitting, true));
    if (serviceFilters.length) filters.push(or(...serviceFilters));

    // Households matching the search term directly, or via a resident/child match.
    const matchedHouseholdIds = filters.length
        ? new Set(
            (
                await db
                    .select({ id: households.id })
                    .from(households)
                    .leftJoin(residents, eq(residents.householdId, households.id))
                    .leftJoin(children, eq(children.householdId, households.id))
                    .where(and(...filters))
                    .all()
            ).map((row) => row.id)
        )
        : null;

    const householdRows = (await db.select().from(households).all()).sort((left, right) =>
        compareStreetAddresses(left.streetAddress, right.streetAddress)
    );
    const filteredHouseholds = matchedHouseholdIds
        ? householdRows.filter((h) => matchedHouseholdIds.has(h.id))
        : householdRows;

    const [allResidents, allChildren] = await Promise.all([
        db.select().from(residents).all(),
        db.select().from(children).all(),
    ]);

    const data = filteredHouseholds.map((household) => ({
        ...household,
        residents: allResidents.filter((r) => r.householdId === household.id),
        children: allChildren.filter((ch) => ch.householdId === household.id),
    }));

    return c.json(data);
});

export default app;