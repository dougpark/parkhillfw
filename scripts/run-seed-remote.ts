import { generateSeedSql } from './seed-directory-remote';

async function main() {
    const isRemote = process.argv.includes('--remote');
    const sqlFile = './data/seed.sql';

    console.log('Generating seed SQL from CSV ./data/directory-import.csv.');
    await generateSeedSql('./data/directory-import.csv', sqlFile);

    console.log(`Executing seed against ${isRemote ? 'REMOTE Cloudflare' : 'LOCAL'} D1 database...`);

    // Build wrangler command arguments
    const args = ['wrangler', 'd1', 'execute', 'parkhillfw-db', `--file=${sqlFile}`];
    if (isRemote) {
        args.push('--remote');
    } else {
        args.push('--local');
    }

    const proc = Bun.spawn(['bun', 'x', ...args], {
        stdout: 'inherit',
        stderr: 'inherit',
    });

    const exitCode = await proc.exited;
    if (exitCode === 0) {
        console.log(`Successfully seeded ${isRemote ? 'REMOTE' : 'LOCAL'} database!`);
    } else {
        console.error(`Seeding failed with exit code ${exitCode}`);
    }

    process.exit(exitCode);
}

main().catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
});