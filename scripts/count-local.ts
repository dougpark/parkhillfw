import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { households, residents, children } from '../src/db/schema';
import { count } from 'drizzle-orm';

async function main() {
    // Check if --remote flag was passed in CLI args
    const isRemote = process.argv.includes('--remote');

    console.log(`Connecting to ${isRemote ? 'REMOTE Cloudflare' : 'LOCAL'} D1 database...`);

    // Explicitly tell getPlatformProxy whether to use remote bindings
    const { env, dispose } = await getPlatformProxy<{ DB: D1Database }>({
        remote: isRemote,
    });
    const db = drizzle(env.DB);

    // Execute row counts in parallel
    const [householdRes, residentRes, childRes] = await Promise.all([
        db.select({ value: count() }).from(households),
        db.select({ value: count() }).from(residents),
        db.select({ value: count() }).from(children),
    ]);

    console.table([
        { Table: 'households', Count: householdRes[0].value },
        { Table: 'residents', Count: residentRes[0].value },
        { Table: 'children', Count: childRes[0].value },
    ]);

    process.exit(0);
}

main().catch((err) => {
    console.error('Failed to query remote table counts:', err);
    process.exit(1);
});