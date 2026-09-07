import { seedDirectory } from './seed-directory';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';

async function main() {
    console.log('Connecting to local D1 database...');

    // Connect to local Wrangler D1 binding
    const { env } = await getPlatformProxy<{ DB: D1Database }>();
    const db = drizzle(env.DB);

    console.log('Seeding local database from "Park Hill Fw Residents.csv"...');
    await seedDirectory(db, './directory-import.csv');

    console.log('Local seed complete!');
    process.exit(0);
}

main().catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
});