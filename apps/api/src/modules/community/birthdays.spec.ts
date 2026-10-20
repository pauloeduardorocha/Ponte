import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../../database/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { PermissionGuard } from '../auth/permission.guard';
import { OperationsService } from '../operations/operations.service';
import { CommunityController } from './community.controller';

describe('Birthday card access', () => {
  let app: INestApplication;
  const query = jest.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CommunityController],
      providers: [
        { provide: PrismaService, useValue: { $queryRaw: query } },
        { provide: OperationsService, useValue: {} },
        {
          provide: AuthService,
          useValue: {
            authenticate: jest
              .fn()
              .mockResolvedValue({
                user: { id: 'member', permissions: [] },
                sessionId: 'session',
              }),
          },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => query.mockReset());
  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/community/birthdays').expect(401);
    expect(query).not.toHaveBeenCalled();
  });
  it('allows authenticated members without administrative permissions', async () => {
    query.mockResolvedValue([{ id: 'birthday', name: 'Maria Santos' }]);
    await request(app.getHttpServer())
      .get('/community/birthdays')
      .set('Authorization', 'Bearer member')
      .expect(200)
      .expect([{ id: 'birthday', name: 'Maria Santos' }]);
  });
  it('returns an empty list when nobody has a birthday', async () => {
    query.mockResolvedValue([]);
    await request(app.getHttpServer())
      .get('/community/birthdays')
      .set('Authorization', 'Bearer member')
      .expect(200)
      .expect([]);
  });
});
