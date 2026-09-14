import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync } from 'fs';

function parseBool(val: string | undefined): number {
    if (!val) return 0;
    const normalized = val.trim().toLowerCase();
    return normalized === 'yes' || normalized === 'true' || normalized === '1' ? 1 : 0;
}

function parseYear(val: string | undefined): string {
    if (!val) return 'NULL';
    const num = parseInt(val.replace(/\D/g, ''), 10);
    return isNaN(num) ? 'NULL' : `${num}`;
}

function escapeSql(val: string | undefined): string {
    if (!val) return 'NULL';
    const trimmed = val.trim();
    if (trimmed === '' || trimmed.toLowerCase() === 'nan') return 'NULL';
    return `'${trimmed.replace(/'/g, "''")}'`;
}

export async function generateSeedSql(csvFilePath: string, outputPath: string) {
    const fileContent = readFileSync(csvFilePath, 'utf-8');

    const rawRecords: string[][] = parse(fileContent, {
        skip_empty_lines: true,
        relax_column_count: true,
    });

    const headerKeys: string[] = rawRecords[2];
    const dataRows = rawRecords.slice(3);

    const sqlStatements: string[] = [];
    sqlStatements.push('-- Auto-generated Seed SQL');
    // D1's remote bulk import doesn't guarantee statement order, so FK checks must be deferred
    sqlStatements.push('PRAGMA defer_foreign_keys = true;');
    sqlStatements.push('DELETE FROM children;');
    sqlStatements.push('DELETE FROM residents;');
    sqlStatements.push('DELETE FROM households;');
    sqlStatements.push("DELETE FROM sqlite_sequence WHERE name IN ('children', 'residents', 'households');\n");

    let householdId = 1;

    for (const row of dataRows) {
        const rowData: Record<string, string> = {};
        headerKeys.forEach((key, idx) => {
            if (key) rowData[key.trim()] = row[idx] || '';
        });

        const streetAddress = escapeSql(rowData['h1-Address'] || rowData['h2-Address']);
        if (streetAddress === 'NULL') continue;

        // 1. Household Insert
        const movedIn = parseYear(rowData['h1-Moved in']);
        const parkHillMember = escapeSql(rowData['h1-Park hill member']);
        const securityMember = parseBool(rowData['h1-Security Member']);
        const pets = escapeSql(rowData['h1-Pets']);
        const notes = escapeSql(rowData['h1-Notes']);

        sqlStatements.push(
            `INSERT INTO households (id, street_address, year_moved_in, park_hill_member, security_member, pets, notes) VALUES (${householdId}, ${streetAddress}, ${movedIn}, ${parkHillMember}, ${securityMember}, ${pets}, ${notes});`
        );

        // 2. Primary Resident (h1)
        const h1First = escapeSql(rowData['h1-Homeowner Firstname']);
        const h1Last = escapeSql(rowData['h1-Homeowner Last Name']);
        if (h1First !== 'NULL' || h1Last !== 'NULL') {
            // first_name/last_name are NOT NULL; fall back to empty string like the local seed script
            const firstName = h1First === 'NULL' ? "''" : h1First;
            const lastName = h1Last === 'NULL' ? "''" : h1Last;
            sqlStatements.push(
                `INSERT INTO residents (household_id, first_name, last_name, is_primary_contact, email, phone_home, phone_mobile, phone_work, occupation) VALUES (${householdId}, ${firstName}, ${lastName}, 1, ${escapeSql(rowData['h1-Homeowner Email Address'])}, ${escapeSql(rowData['h1-Home Phone'])}, ${escapeSql(rowData['h1-Cell Phone'])}, ${escapeSql(rowData['h1-Work Phone'])}, ${escapeSql(rowData['h1-Occupation'])});`
            );
        }

        // 3. Secondary Resident (h2)
        const h2First = escapeSql(rowData['h2-Homeowner Firstname']);
        const h2Last = escapeSql(rowData['h2-Homeowner Last Name']);
        if (h2First !== 'NULL' || h2Last !== 'NULL') {
            const firstName = h2First === 'NULL' ? "''" : h2First;
            // default secondary's last name to the primary's when blank
            const lastName = h2Last === 'NULL' ? (h1Last === 'NULL' ? "''" : h1Last) : h2Last;
            sqlStatements.push(
                `INSERT INTO residents (household_id, first_name, last_name, is_primary_contact, email, phone_home, phone_mobile, phone_work, occupation) VALUES (${householdId}, ${firstName}, ${lastName}, 0, ${escapeSql(rowData['h2-Homeowner Email Address'])}, ${escapeSql(rowData['h2-Home Phone'])}, ${escapeSql(rowData['h2-Cell Phone'])}, ${escapeSql(rowData['h2-Work Phone'])}, ${escapeSql(rowData['h2-Occupation'])});`
            );
        }

        // 4. Children (c1..c5)
        for (let i = 1; i <= 5; i++) {
            const cFirst = rowData[`c${i}-First Name`]?.trim();
            const cLast = rowData[`c${i}-Last Name`]?.trim();
            if (cFirst || cLast) {
                const fullName = escapeSql([cFirst, cLast].filter(Boolean).join(' '));
                sqlStatements.push(
                    `INSERT INTO children (household_id, name, birth_year, school, residence_location, pet_sitting, babysitting, special_skills) VALUES (${householdId}, ${fullName}, ${parseYear(rowData[`c${i}-Birth Year`])}, ${escapeSql(rowData[`C${i}-school`] || rowData[`c${i}-School`])}, ${escapeSql(rowData[`c${i}-Residence`])}, ${parseBool(rowData[`c${i}-pet_sitting`])}, ${parseBool(rowData[`c${i}-babysitting`])}, ${escapeSql(rowData[`c${i}-Special Skills Services`] || rowData[`c${i}-Special Skills/Services`])});`
                );
            }
        }

        householdId++;
    }

    // Deleting residents cascades resident_id to NULL on every users row (ON DELETE SET NULL);
    // restore the link by email, same match rule used at login (lib/auth.ts completeLogin).
    sqlStatements.push(
        "\n-- Re-link existing users to their re-seeded resident rows by email",
        `UPDATE users SET resident_id = (SELECT id FROM residents WHERE lower(residents.email) = lower(users.email)), link_status = 'auto_matched' WHERE resident_id IS NULL AND EXISTS (SELECT 1 FROM residents WHERE lower(residents.email) = lower(users.email));`
    );

    writeFileSync(outputPath, sqlStatements.join('\n'), 'utf-8');
    console.log(`Generated SQL file at: ${outputPath}`);
}