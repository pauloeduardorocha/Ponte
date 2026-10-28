const config = { ...require('./package.json').jest };
delete config.testRegex;

module.exports = {
  ...config,
  testMatch: [
    '**/src/**/*.spec.ts',
    '**/test/**/*.spec.ts',
    // HTTP adapter test with a mocked database; does not require PostgreSQL.
    '**/test/health.e2e-spec.ts',
  ],
};
