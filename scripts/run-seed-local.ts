import { seedDirectory } from './seed-directory-local';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';

async function main() {
    // Check if --remote flag was passed in CLI args
    const isRemote = process.argv.includes('--remote');

    console.log(`Connecting to ${isRemote ? 'REMOTE Cloudflare' : 'LOCAL'} D1 database...`);

    // Explicitly tell getPlatformProxy whether to use remote bindings
    const { env, dispose } = await getPlatformProxy<{ DB: D1Database }>({
        remote: isRemote,
    });
    const db = drizzle(env.DB);

    console.log('Seeding database from "./data/directory-import.csv"...');
    await seedDirectory(db, './data/directory-import.csv');

    console.log('Seed complete!');
    process.exit(0);
}

main().catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
});