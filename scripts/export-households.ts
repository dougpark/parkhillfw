import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { households } from '../src/db/schema';

async function main() {
    // Connect to local Wrangler D1 binding
    const { env } = await getPlatformProxy<{ DB: D1Database }>();
    const db = drizzle(env.DB);

    console.log('Fetching households from local D1 database...\n');
    const allHouseholds = await db.select().from(households);

    if (allHouseholds.length === 0) {
        console.log('No households found in database.');
        process.exit(0);
    }

    // Format and log as a terminal table
    console.table(
        allHouseholds.map((h) => ({
            ID: h.id,
            Address: h.streetAddress,
            'Moved In': h.yearMovedIn || 'N/A',
            'Park Hill Member': h.parkHillMember || 'None',
            'Security Member': h.securityMember ? 'Yes' : 'No',
            Pets: h.pets || 'None',
        }))
    );

    console.log(`\nTotal Households: ${allHouseholds.length}`);
    process.exit(0);
}

main().catch((err) => {
    console.error('Failed to fetch households:', err);
    process.exit(1);
});