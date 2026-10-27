const config = { ...require('./package.json').jest };
delete config.testRegex;

module.exports = {
  ...config,
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  testPathIgnorePatterns: ['/health.e2e-spec.ts$'],
  setupFiles: ['<rootDir>/test/require-test-database.cjs'],
};
