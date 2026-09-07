import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { drizzle } from 'drizzle-orm/d1';
import { households, residents, children } from '../src/db/schema';

function parseBool(val: string | undefined): boolean {
    if (!val) return false;
    const normalized = val.trim().toLowerCase();
    return normalized === 'yes' || normalized === 'true' || normalized === '1';
}

function parseYear(val: string | undefined): number | null {
    if (!val) return null;
    const num = parseInt(val.replace(/\D/g, ''), 10);
    return isNaN(num) ? null : num;
}

function cleanString(val: string | undefined): string | null {
    if (!val) return null;
    const trimmed = val.trim();
    return trimmed === '' || trimmed.toLowerCase() === 'nan' ? null : trimmed;
}

export async function seedDirectory(db: ReturnType<typeof drizzle>, csvFilePath: string) {
    const fileContent = readFileSync(csvFilePath, 'utf-8');

    const rawRecords: string[][] = parse(fileContent, {
        skip_empty_lines: true,
        relax_column_count: true,
    });

    // Header row is index 2 (row 3 in CSV); data starts at index 3
    const headerKeys: string[] = rawRecords[2];
    const dataRows = rawRecords.slice(3);

    console.log(`Processing ${dataRows.length} family rows from CSV...`);

    let householdCount = 0;
    let residentCount = 0;
    let childCount = 0;

    for (const row of dataRows) {
        const rowData: Record<string, string> = {};
        headerKeys.forEach((key, idx) => {
            if (key) {
                rowData[key.trim()] = row[idx] || '';
            }
        });

        const streetAddress = cleanString(rowData['h1-Address']) || cleanString(rowData['h2-Address']);
        if (!streetAddress) continue;

        // 1. Insert Household
        const [insertedHousehold] = await db
            .insert(households)
            .values({
                streetAddress,
                yearMovedIn: parseYear(rowData['h1-Moved in']),
                parkHillMember: cleanString(rowData['h1-Park hill member']), // Stores string tier (e.g. "PARK HILL REGULAR")
                securityMember: parseBool(rowData['h1-Security Member']),
                pets: cleanString(rowData['h1-Pets']),
                notes: cleanString(rowData['h1-Notes']),
            })
            .returning();

        householdCount++;

        // 2. Insert Primary Resident (h1)
        const h1First = cleanString(rowData['h1-Homeowner Firstname']);
        const h1Last = cleanString(rowData['h1-Homeowner Last Name']);

        if (h1First || h1Last) {
            await db.insert(residents).values({
                householdId: insertedHousehold.id,
                firstName: h1First || '',
                lastName: h1Last || '',
                isPrimaryContact: true,
                email: cleanString(rowData['h1-Homeowner Email Address']),
                phoneHome: cleanString(rowData['h1-Home Phone']),
                phoneMobile: cleanString(rowData['h1-Cell Phone']),
                phoneWork: cleanString(rowData['h1-Work Phone']),
                occupation: cleanString(rowData['h1-Occupation']),
            });
            residentCount++;
        }

        // 3. Insert Secondary Resident (h2)
        const h2First = cleanString(rowData['h2-Homeowner Firstname']);
        const h2Last = cleanString(rowData['h2-Homeowner Last Name']);

        if (h2First || h2Last) {
            await db.insert(residents).values({
                householdId: insertedHousehold.id,
                firstName: h2First || '',
                lastName: h2Last || (h1Last || ''),
                isPrimaryContact: false,
                email: cleanString(rowData['h2-Homeowner Email Address']),
                phoneHome: cleanString(rowData['h2-Home Phone']),
                phoneMobile: cleanString(rowData['h2-Cell Phone']),
                phoneWork: cleanString(rowData['h2-Work Phone']),
                occupation: cleanString(rowData['h2-Occupation']),
            });
            residentCount++;
        }

        // 4. Insert Up to 5 Children (c1 through c5)
        for (let i = 1; i <= 5; i++) {
            const cFirst = cleanString(rowData[`c${i}-First Name`]);
            const cLast = cleanString(rowData[`c${i}-Last Name`]);

            if (cFirst || cLast) {
                const fullName = [cFirst, cLast].filter(Boolean).join(' ');
                await db.insert(children).values({
                    householdId: insertedHousehold.id,
                    name: fullName,
                    birthYear: parseYear(rowData[`c${i}-Birth Year`]),
                    school: cleanString(rowData[`C${i}-school`] || rowData[`c${i}-School`]),
                    occupation: cleanString(rowData[`c${i}-Occupation`]),
                    residenceLocation: cleanString(rowData[`c${i}-Residence`]),
                    petSitting: parseBool(rowData[`c${i}-pet_sitting`]),
                    babysitting: parseBool(rowData[`c${i}-babysitting`]),
                    specialSkills: cleanString(
                        rowData[`c${i}-Special Skills Services`] || rowData[`c${i}-Special Skills/Services`]
                    ),
                });
                childCount++;
            }
        }
    }

    console.log(`\nImport completed successfully!`);
    console.log(`- Households: ${householdCount}`);
    console.log(`- Residents: ${residentCount}`);
    console.log(`- Children: ${childCount}`);
}