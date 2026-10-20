// Explicit credentials only: never auto-load .env or print a connection string.
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('node:child_process');

async function main() {
  const action = process.argv[2];
  if (!['apply', 'provision', 'deploy', 'bootstrap'].includes(action)) {
    throw new Error('Usage: database-security.cjs apply|provision|deploy|bootstrap');
  }
  const connection = process.env.ADMIN_DATABASE_URL;
  if (!connection) throw new Error('Supply ADMIN_DATABASE_URL explicitly');
  const url = new URL(connection);
  if (url.hostname.includes('-pooler'))
    throw new Error('Use a direct administrative connection');
  const password = process.env.RUNTIME_DATABASE_PASSWORD;
  if (
    ['provision', 'bootstrap'].includes(action) &&
    (!password || !/^[A-Za-z0-9_-]{48,}$/.test(password))
  ) {
    throw new Error(
      'Supply a random RUNTIME_DATABASE_PASSWORD with at least 48 base64url characters',
    );
  }
  if (['deploy', 'bootstrap'].includes(action)) {
    // Migrations always use the owner, never the runtime DATABASE_URL.
    // Capture diagnostics to avoid emitting credentials from engine failures.
    const migrated = spawnSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
        '--schema',
        resolve(__dirname, '../prisma/schema.prisma'),
      ],
      { env: { ...process.env, DATABASE_URL: connection }, encoding: 'utf8' },
    );
    if (migrated.status !== 0) throw new Error('Migration failed');
    console.log(
      'Migrations applied with the explicit administrative connection.',
    );
  }
  const db = new PrismaClient({ datasources: { db: { url: connection } } });
  try {
    let createRuntime = false;
    if (['provision', 'bootstrap'].includes(action)) {
      const existing =
        await db.$queryRaw`SELECT 1 FROM pg_roles WHERE rolname='church_app'`;
      if (existing.length && action === 'provision')
        throw new Error(
          'church_app already exists; password rotation requires a separate planned cutover',
        );
      createRuntime = existing.length === 0;
    }
    await db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          readFileSync(
            resolve(__dirname, '../prisma/runtime-privileges.sql'),
            'utf8',
          ),
        );
        if (createRuntime) {
          // Validated alphabet above; PostgreSQL role passwords cannot be bind parameters.
          await tx.$executeRawUnsafe(
            `CREATE ROLE church_app LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`,
          );
          await tx.$executeRawUnsafe('GRANT church_runtime TO church_app');
        }
      },
      { timeout: 30000 },
    );
    console.log('Database runtime privileges applied. No credentials printed.');
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    'Database security provisioning failed; verify explicit credentials, role state and administrative access. No credentials logged.',
  );
  process.exitCode = 1;
});
