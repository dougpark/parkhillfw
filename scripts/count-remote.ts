

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const DATABASE_ID = "e707738a-20a7-4332-9135-d3ca5d1f489d"; // Found in wrangler.json
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

async function queryRemoteD1(sql: string) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql }),
    });

    const data = await response.json();
    if (!data.success) {
        throw new Error(`D1 API Error: ${JSON.stringify(data.errors)}`);
    }
    return data.result[0].results;
}

async function main() {
    console.log('Fetching row counts from REMOTE Cloudflare D1...');

    const results = await queryRemoteD1(`
    SELECT 'households' AS table_name, COUNT(*) AS count FROM households
    UNION ALL
    SELECT 'residents' AS table_name, COUNT(*) AS count FROM residents
    UNION ALL
    SELECT 'children' AS table_name, COUNT(*) AS count FROM children;
  `);

    console.table(results);
}

main().catch(console.error);