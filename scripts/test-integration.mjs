import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (
  process.argv
    .slice(2)
    .some(
      (arg) =>
        ![
          '--security-only',
          '--recovery-only',
          '--notifications-only',
        ].includes(arg),
    )
) {
  throw new Error(
    'Usage: test-integration.mjs [--security-only|--recovery-only|--notifications-only]',
  );
}
const recoveryOnly = process.argv.includes('--recovery-only');
const securityOnly = process.argv.includes('--security-only');
const notificationsOnly = process.argv.includes('--notifications-only');
if ([securityOnly, recoveryOnly, notificationsOnly].filter(Boolean).length > 1)
  throw new Error('Choose one integration mode.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(root, 'apps/api');
const apiRequire = createRequire(join(api, 'package.json'));
const id = randomBytes(8).toString('hex');
const project = `ponte-test-${id}`;
const database = `ponte_push_test_${id}`;
const storage = mkdtempSync(join(tmpdir(), 'ponte-ci-'));
const env = {
  ...process.env,
  NODE_ENV: 'test',
  RECOVERY_DRILL: '',
  PONTE_TEST_POSTGRES_DB: database,
  PONTE_TEST_POSTGRES_VERSION: recoveryOnly ? '18' : '17',
  PONTE_TEST_POSTGRES_PASSWORD: randomBytes(36).toString('base64url'),
  JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
  JWT_REFRESH_SECRET: randomBytes(48).toString('base64url'),
  RUNTIME_DATABASE_PASSWORD: randomBytes(48).toString('base64url'),
  PRIVATE_STORAGE_PATH: storage,
  PRIVATE_STORAGE_DRIVER: 'filesystem',
  VERCEL: '',
  BIRD_API_KEY: '',
  FRONTEND_ERROR_EMAIL_TO: '',
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  WEB_PUSH_PUBLIC_KEY: '',
  WEB_PUSH_PRIVATE_KEY: '',
  CORS_ORIGIN: 'http://localhost:5173',
  PUBLIC_WEB_URL: 'http://localhost:5173',
};
// These are provisioned below; never inherit connections to another database.
for (const key of Object.keys(env)) {
  if (key.startsWith('DB_SECURITY_')) delete env[key];
}

function run(command, args, { cwd = root, capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    // Do not include command arguments or captured diagnostics containing URLs.
    throw new Error(
      `${command} failed (${result.status ?? result.error?.code}).`,
    );
  }
  return result.stdout?.trim();
}

const nativeDocker =
  process.platform !== 'win32' ||
  (process.env.PATH ?? '')
    .split(';')
    .some((directory) => existsSync(join(directory, 'docker.exe')));
const docker = nativeDocker
  ? process.platform === 'win32'
    ? 'docker.exe'
    : 'docker'
  : 'wsl.exe';
const dockerPrefix = nativeDocker
  ? []
  : [
      '--exec',
      'env',
      `PONTE_TEST_POSTGRES_DB=${env.PONTE_TEST_POSTGRES_DB}`,
      `PONTE_TEST_POSTGRES_PASSWORD=${env.PONTE_TEST_POSTGRES_PASSWORD}`,
      `PONTE_TEST_POSTGRES_VERSION=${env.PONTE_TEST_POSTGRES_VERSION}`,
      'docker',
    ];
const composeArgs = [
  ...dockerPrefix,
  'compose',
  '--env-file',
  nativeDocker && process.platform === 'win32' ? 'NUL' : '/dev/null',
  '-f',
  'docker-compose.test.yml',
  '-p',
  project,
];
// An empty env file prevents Compose from loading the application's .env.
const compose = (...args) => run(docker, [...composeArgs, ...args]);
const node = (script, args = [], options = {}) =>
  run(process.execPath, [script, ...args], { cwd: api, ...options });
const jest = apiRequire.resolve('jest/bin/jest');
// On this Windows setup Docker runs inside WSL. Keep a foreground WSL session
// open so the distribution does not shut its daemon down between CLI calls.
const wslSession = nativeDocker
  ? null
  : spawn('wsl.exe', ['--exec', 'sh', '-c', 'cat >/dev/null'], {
      stdio: ['pipe', 'ignore', 'ignore'],
    });
wslSession?.on('error', () => {
  process.exitCode = 1;
});

try {
  console.log(
    `Starting isolated PostgreSQL ${env.PONTE_TEST_POSTGRES_VERSION} (${project}).`,
  );
  compose('up', '-d', '--wait', '--wait-timeout', '120');
  const binding = run(docker, [...composeArgs, 'port', 'postgres', '5432'], {
    capture: true,
  });
  const port = /^127\.0\.0\.1:(\d+)$/.exec(binding)?.[1];
  if (!port) throw new Error('Could not determine the local PostgreSQL port.');
  const url = new URL(
    `postgresql://127.0.0.1:${port}/${database}?schema=public`,
  );
  url.username = 'church_test';
  url.password = env.PONTE_TEST_POSTGRES_PASSWORD;
  env.DATABASE_URL = env.TEST_DATABASE_URL = url.toString();
  console.log(
    `Database URL derived from Compose: 127.0.0.1:${port}/${database} (credentials omitted).`,
  );

  // Existing migrations grant to this deployment role. Provision the empty
  // NOLOGIN group before replaying history on a completely fresh cluster.
  compose(
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'church_test',
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'CREATE ROLE church_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  );
  node(apiRequire.resolve('prisma/build/index.js'), ['migrate', 'deploy']);
  if (recoveryOnly) {
    compose(
      'exec',
      '-T',
      '--user',
      'root',
      'postgres',
      'apk',
      'add',
      '--no-cache',
      'bash',
      'restic',
      'rclone',
      'diffutils',
      'jq',
    );
    for (const file of [
      'backup-database.sh',
      'restore-database.sh',
      'test-recovery.sh',
      'rehearse-recovery.sh',
    ]) {
      compose('cp', `scripts/${file}`, `postgres:/tmp/${file}`);
    }
    compose('exec', '-T', 'postgres', 'mkdir', '-p', '/opt/ponte');
    compose(
      'cp',
      'apps/api/prisma/runtime-privileges.sql',
      'postgres:/opt/ponte/runtime-privileges.sql',
    );
    compose(
      'exec',
      '-T',
      'postgres',
      'env',
      'PGHOST=127.0.0.1',
      `PGDATABASE=${database}`,
      'PGUSER=church_test',
      `PGPASSWORD=${env.PONTE_TEST_POSTGRES_PASSWORD}`,
      'bash',
      '/tmp/test-recovery.sh',
    );
    url.pathname = '/ponte_restore_drill';
    env.DATABASE_URL = env.TEST_DATABASE_URL = url.toString();
    env.RECOVERY_DRILL = 'true';
  }
  if (!securityOnly && !recoveryOnly)
    node(jest, [
      '--config',
      'jest.integration.config.cjs',
      '--runInBand',
      '--testPathIgnorePatterns',
      'health.e2e-spec.ts',
      'database-runtime.e2e-spec.ts',
      ...(notificationsOnly
        ? [
            '--runTestsByPath',
            'test/notification-outbox.e2e-spec.ts',
            'test/notifications.e2e-spec.ts',
            'test/operations.e2e-spec.ts',
          ]
        : []),
    ]);

  // Exercise production privileges on the same disposable container, after the
  // owner-based fixtures have finished creating/dropping their isolated schemas.
  env.ADMIN_DATABASE_URL = url.toString();
  node(join(api, 'scripts/database-security.cjs'), ['bootstrap']);
  env.DB_SECURITY_TEST_ADMIN_URL = url.toString();
  const runtimeUrl = new URL(url);
  runtimeUrl.username = 'church_app';
  runtimeUrl.password = env.RUNTIME_DATABASE_PASSWORD;
  env.DB_SECURITY_TEST_RUNTIME_URL = runtimeUrl.toString();
  env.DB_SECURITY_TEST_HOST = '127.0.0.1';
  env.DB_SECURITY_PRODUCTION_HOST = 'production.invalid';
  node(jest, [
    '--config',
    'jest.integration.config.cjs',
    '--runInBand',
    '--runTestsByPath',
    'test/database-runtime.e2e-spec.ts',
    ...(recoveryOnly ? ['test/recovery.e2e-spec.ts'] : []),
  ]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  try {
    compose('down', '--volumes', '--remove-orphans');
  } catch {
    console.error(
      `Could not remove test project ${project}; inspect Docker Compose.`,
    );
    process.exitCode = 1;
  }
  if (dirname(storage) === resolve(tmpdir()))
    rmSync(storage, { recursive: true, force: true });
  wslSession?.stdin.end();
}
