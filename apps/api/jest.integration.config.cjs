const config = { ...require('./package.json').jest };
delete config.testRegex;

module.exports = {
  ...config,
  testMatch: ['**/test/**/*.e2e-spec.ts'],
  testPathIgnorePatterns: ['/health.e2e-spec.ts$'],
  setupFiles: ['<rootDir>/test/require-test-database.cjs'],
};
