// Deliberately do not call init() or listen(): generating a contract must not
// connect to PostgreSQL, run lifecycle jobs or send external requests.
if (process.env.PONTE_OPENAPI_GENERATION !== '1')
  throw new Error('Use npm run openapi:generate or npm run openapi:check.');

require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { API_PREFIX, createOpenApiDocument } = require('../dist/openapi');
const { PrismaService } = require('../dist/database/prisma.service');

PrismaService.prototype.onModuleInit = async () => {
  throw new Error(
    'Database initialization is forbidden during OpenAPI generation.',
  );
};
PrismaService.prototype.$connect = async () => {
  throw new Error(
    'Database connections are forbidden during OpenAPI generation.',
  );
};

async function exportDocument() {
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    app.setGlobalPrefix(API_PREFIX);
    process.stdout.write(JSON.stringify(createOpenApiDocument(app)));
  } finally {
    await app.close();
  }
}

exportDocument().catch(() => {
  console.error(
    'OpenAPI export failed. Check the compiled DTOs and application configuration.',
  );
  process.exitCode = 1;
});
