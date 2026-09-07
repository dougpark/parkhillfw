import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';
import { households, residents, children } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { writeFileSync } from 'fs';

async function main() {
    const { env } = await getPlatformProxy<{ DB: D1Database }>();
    const db = drizzle(env.DB);

    console.log('Fetching full directory export from local D1 database...');

    const allHouseholds = await db.select().from(households);

    if (allHouseholds.length === 0) {
        console.log('No households found in database.');
        process.exit(0);
    }

    const lines: string[] = [];
    lines.push('# Park Hill Directory Export\n');
    lines.push(`*Generated on ${new Date().toISOString().split('T')[0]}*\n`);

    for (const h of allHouseholds) {
        const householdResidents = await db
            .select()
            .from(residents)
            .where(eq(residents.householdId, h.id));

        const householdChildren = await db
            .select()
            .from(children)
            .where(eq(children.householdId, h.id));

        lines.push('---');
        lines.push(`## Household #${h.id}: ${h.streetAddress}\n`);
        lines.push(`- **Moved In:** ${h.yearMovedIn || 'N/A'}`);
        lines.push(`- **Park Hill Member:** ${h.parkHillMember || 'None'}`);
        lines.push(`- **Security Member:** ${h.securityMember ? 'Yes' : 'No'}`);
        if (h.pets) lines.push(`- **Pets:** ${h.pets}`);
        if (h.notes) lines.push(`- **Notes:** ${h.notes}`);
        lines.push('');

        // Adult Residents Table
        lines.push('### Adult Residents');
        if (householdResidents.length > 0) {
            lines.push('| Name | Primary | Email | Mobile Phone | Home Phone | Occupation |');
            lines.push('| --- | --- | --- | --- | --- | --- |');
            for (const r of householdResidents) {
                const fullName = `${r.firstName} ${r.lastName}`.trim();
                const primary = r.isPrimaryContact ? 'Yes' : 'No';
                const email = r.email || 'N/A';
                const mobile = r.phoneMobile || 'N/A';
                const home = r.phoneHome || 'N/A';
                const occ = r.occupation || 'N/A';
                lines.push(`| ${fullName} | ${primary} | ${email} | ${mobile} | ${home} | ${occ} |`);
            }
        } else {
            lines.push('*No adult residents listed.*');
        }
        lines.push('');

        // Children Table
        if (householdChildren.length > 0) {
            lines.push('### Children & Dependents');
            lines.push('| Name | Birth Year | School | Location | Pet Sitting | Babysitting | Special Skills |');
            lines.push('| --- | --- | --- | --- | --- | --- | --- |');
            for (const c of householdChildren) {
                const name = c.name;
                const year = c.birthYear || 'N/A';
                const school = c.school || 'N/A';
                const loc = c.residenceLocation || 'N/A';
                const pet = c.petSitting ? 'Yes' : 'No';
                const baby = c.babysitting ? 'Yes' : 'No';
                const skills = c.specialSkills || 'N/A';
                lines.push(`| ${name} | ${year} | ${school} | ${loc} | ${pet} | ${baby} | ${skills} |`);
            }
            lines.push('');
        }
    }

    const outputPath = './directory-export.md';
    writeFileSync(outputPath, lines.join('\n'), 'utf-8');
    console.log(`Successfully exported directory to ${outputPath}`);
    process.exit(0);
}

main().catch((err) => {
    console.error('Failed to export directory to markdown:', err);
    process.exit(1);
});