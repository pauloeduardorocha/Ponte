const config = { ...require('./package.json').jest };
delete config.testRegex;

module.exports = {
  ...config,
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/test/**/*.spec.ts',
    // HTTP adapter test with a mocked database; does not require PostgreSQL.
    '<rootDir>/test/health.e2e-spec.ts',
  ],
};
