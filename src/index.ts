import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { residents } from './db/schema';

type Bindings = {
    DB: D1Database;
    BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/api/health', (c) => c.json({ status: 'ok', runtime: 'bun-cloudflare' }));

app.get('/api/residents', async (c) => {
    const db = drizzle(c.env.DB);
    const data = await db.select().from(residents).all();
    return c.json(data);
});

export default app;