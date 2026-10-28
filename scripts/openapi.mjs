import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
if (
  !['generate', 'check'].includes(mode) ||
  process.argv.slice(3).some((arg) => arg !== '--skip-build')
)
  throw new Error('Usage: openapi.mjs generate|check [--skip-build]');
// No application .env or provider credentials are needed for documentation.
const env = {
  ...process.env,
  PONTE_OPENAPI_GENERATION: '1',
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/openapi_codegen',
  JWT_ACCESS_SECRET: 'openapi-codegen-only-access-never-use-at-runtime',
  JWT_REFRESH_SECRET: 'openapi-codegen-only-refresh-never-use-at-runtime',
  BIRD_API_KEY: '',
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  WEB_PUSH_PUBLIC_KEY: '',
  WEB_PUSH_PRIVATE_KEY: '',
  NOTIFICATION_OUTBOX_SECRET: '',
  FRONTEND_ERROR_EMAIL_TO: '',
  PRIVATE_STORAGE_DRIVER: 'filesystem',
  VERCEL: '',
  PUBLIC_WEB_URL: 'http://localhost:5173',
  CORS_ORIGIN: 'http://localhost:5173',
};
function run(script, args, capture = false) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error || result.status !== 0)
    throw new Error(
      capture ? 'OpenAPI exporter failed.' : 'OpenAPI build failed.',
    );
  return result.stdout;
}
if (!process.argv.includes('--skip-build')) {
  const npm =
    process.env.npm_execpath ??
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  run(npm, ['run', 'build', '--workspace', '@church/shared']);
  run(npm, ['run', 'db:generate']);
  run(npm, ['exec', '--workspace', '@church/api', '--', 'nest', 'build']);
}
const raw = JSON.parse(
  run(join(root, 'apps/api/scripts/export-openapi.cjs'), [], true),
);
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sort(value[key])]),
    );
  return value;
}
const document = `${JSON.stringify(sort(raw), null, 2)}\n`;
const destination = join(root, 'docs/openapi.json');
if (mode === 'generate') {
  writeFileSync(destination, document);
  console.log('Generated docs/openapi.json from the compiled application.');
} else if (
  readFileSync(destination, 'utf8').replaceAll('\r\n', '\n') !== document
) {
  console.error(
    'docs/openapi.json is out of date. Run npm run openapi:generate and commit the result.',
  );
  process.exitCode = 1;
} else console.log('OpenAPI contract matches the compiled application.');
