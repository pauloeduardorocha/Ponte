import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach } from '@jest/globals';
import { PrismaService } from '../src/database/prisma.service';
import { HealthModule } from '../src/modules/health/health.module';

describe('HealthController', () => {
  let app: INestApplication;
  const queryRaw = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: queryRaw })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(() => {
    queryRaw.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the API and database as healthy', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({
        status: 'ok',
        services: { api: 'up', database: 'up' },
      });
  });

  it('reports an unavailable database as degraded', async () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    queryRaw.mockRejectedValue(new Error('database unavailable'));

    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(503)
      .expect({
        status: 'degraded',
        services: { api: 'up', database: 'down' },
      });

    expect(logError).toHaveBeenCalledWith('Database health check failed');
  });
});
