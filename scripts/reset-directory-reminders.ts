const isRemote = process.argv.includes('--remote');
const targetFlag = isRemote ? '--remote' : '--local';
const dbName = 'parkhillfw-db';

console.log(`Resetting directory confirmation and updated timestamps on ${isRemote ? 'REMOTE' : 'LOCAL'} database...`);

const sql = `UPDATE households SET directory_confirmed_at = NULL, updated_at = NULL; UPDATE users SET updated_at = NULL;`;

const proc = Bun.spawn(['bun', 'x', 'wrangler', 'd1', 'execute', dbName, targetFlag, '--command', sql], {
    stdout: 'inherit',
    stderr: 'inherit',
});

const exitCode = await proc.exited;

if (exitCode !== 0) {
    console.error(`Failed to execute reset script on ${isRemote ? 'REMOTE' : 'LOCAL'} D1 database.`);
    process.exit(exitCode);
}

console.log(`Successfully reset directory reminder flags on ${isRemote ? 'REMOTE' : 'LOCAL'} D1 database.`);

