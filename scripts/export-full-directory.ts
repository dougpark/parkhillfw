import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { households, residents, children } from '../src/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
    const { env } = await getPlatformProxy<{ DB: D1Database }>();
    const db = drizzle(env.DB);

    console.log('Fetching full directory export from local D1 database...\n');

    // Fetch all households
    const allHouseholds = await db.select().from(households);

    if (allHouseholds.length === 0) {
        console.log('No households found in database.');
        process.exit(0);
    }

    const DIVIDER = '═'.repeat(100);

    for (const h of allHouseholds) {
        // Query matching residents & children for current household
        const householdResidents = await db
            .select()
            .from(residents)
            .where(eq(residents.householdId, h.id));

        const householdChildren = await db
            .select()
            .from(children)
            .where(eq(children.householdId, h.id));

        console.log(DIVIDER);
        console.log(`🏠 HOUSEHOLD #${h.id} | Address: ${h.streetAddress}`);
        console.log(`   Moved In: ${h.yearMovedIn || 'N/A'} | Park Hill Member: ${h.parkHillMember || 'None'} | Security Member: ${h.securityMember ? 'Yes' : 'No'}`);
        if (h.pets) console.log(`   Pets: ${h.pets}`);
        if (h.notes) console.log(`   Notes: ${h.notes}`);

        // Print Residents
        if (householdResidents.length > 0) {
            console.log('\n   👤 Residents:');
            console.table(
                householdResidents.map((r) => ({
                    'First Name': r.firstName,
                    'Last Name': r.lastName,
                    Primary: r.isPrimaryContact ? 'Yes' : 'No',
                    Email: r.email || 'N/A',
                    Mobile: r.phoneMobile || 'N/A',
                    Home: r.phoneHome || 'N/A',
                    Occupation: r.occupation || 'N/A',
                }))
            );
        } else {
            console.log('\n   👤 Residents: (None)');
        }

        // Print Children
        if (householdChildren.length > 0) {
            console.log('   👶 Children / Dependents:');
            console.table(
                householdChildren.map((c) => ({
                    Name: c.name,
                    'Birth Year': c.birthYear || 'N/A',
                    School: c.school || 'N/A',
                    Location: c.residenceLocation || 'N/A',
                    'Pet Sitting': c.petSitting ? 'Yes' : 'No',
                    Babysitting: c.babysitting ? 'Yes' : 'No',
                    'Special Skills': c.specialSkills || 'N/A',
                }))
            );
        }

        console.log(''); // Blank line space
    }

    console.log(DIVIDER);
    console.log(`Total Households Exported: ${allHouseholds.length}`);
    process.exit(0);
}

main().catch((err) => {
    console.error('Failed to export full directory:', err);
    process.exit(1);
});