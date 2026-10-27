// A missing URL must fail the integration gate, never silently skip suites.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'Run npm run test:integration to provision disposable PostgreSQL.',
  );
}
