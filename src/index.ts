import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, like, or } from 'drizzle-orm';
import { children, households, residents } from './db/schema';
import { requireAuth } from './middleware/auth';

type Bindings = {
    DB: D1Database;
    BUCKET: R2Bucket;
    DEV_BYPASS_AUTH?: string;
    JWT_SECRET?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/api/health', (c) => c.json({ status: 'ok', runtime: 'bun-cloudflare' }));

app.get('/api/residents', async (c) => {
    const db = drizzle(c.env.DB);
    const data = await db.select().from(residents).all();
    return c.json(data);
});

app.get('/api/directory', requireAuth(), async (c) => {
    const db = drizzle(c.env.DB);
    const q = c.req.query('q')?.trim();

    // Households matching the search term directly, or via a resident/child match.
    const matchedHouseholdIds = q
        ? new Set(
            (
                await db
                    .select({ id: households.id })
                    .from(households)
                    .leftJoin(residents, eq(residents.householdId, households.id))
                    .leftJoin(children, eq(children.householdId, households.id))
                    .where(
                        or(
                            like(households.streetAddress, `%${q}%`),
                            like(residents.firstName, `%${q}%`),
                            like(residents.lastName, `%${q}%`),
                            like(residents.email, `%${q}%`),
                            like(children.name, `%${q}%`)
                        )
                    )
                    .all()
            ).map((row) => row.id)
        )
        : null;

    const householdRows = await db.select().from(households).orderBy(households.streetAddress).all();
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