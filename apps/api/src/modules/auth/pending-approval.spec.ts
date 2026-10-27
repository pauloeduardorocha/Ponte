import { MembersService } from '../members/members.service';
import * as argon2 from 'argon2';
import {
  Controller,
  Get,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PERMISSIONS, CurrentUser, MEMBER_PERMISSIONS } from '@church/shared';
import request from 'supertest';
import { PrismaService } from '../../database/prisma.service';
import { AuthGuard } from './auth.guard';
import { AuthService, safeUser } from './auth.service';
import { RegisterDto } from './auth.dto';
import { PermissionGuard } from './permission.guard';
import { PendingEmailDelivery } from './password-reset.delivery';
import { UsersController } from '../users/users.controller';
import { CommunityController } from '../community/community.controller';
import { OperationsService } from '../operations/operations.service';
import { VideosController, VideosService } from '../videos/videos.module';
import { PlaylistVideosService } from '../videos/playlist-videos.service';

const pending = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Test',
  email: 'test@example.test',
  status: 'PENDING_APPROVAL',
  permissions: [],
  roles: [],
} satisfies CurrentUser;
const dto = {
  name: 'Test',
  email: 'test@example.test',
  password: 'long-password-test',
  phone: '+351 912 345 678',
  birthDate: '1990-05-20',
};

@Controller('restricted')
class RestrictedController {
  @Get() read() {
    return { secret: true };
  }
}

describe('Pending approval HTTP authorization', () => {
  let app: INestApplication;
  let identity: CurrentUser;
  let account: { status: string; deletedAt: Date | null };
  const user = {
    findUnique: jest.fn(() => account),
    update: jest.fn(() => {
      account.status = 'ACTIVE';
      return { id: pending.id, status: 'ACTIVE' };
    }),
    findMany: jest.fn(() => []),
    count: jest.fn(() => 0),
  };
  const userRole = { deleteMany: jest.fn() };
  const db = {
    user,
    userRole,
    $queryRaw: jest.fn(() => []),
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? arg(db)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        RestrictedController,
        UsersController,
        CommunityController,
        VideosController,
      ],
      providers: [
        { provide: PrismaService, useValue: db },
        {
          provide: AuthService,
          useValue: {
            authenticate: async () => ({
              user: identity,
              sessionId: 'session',
            }),
          },
        },
        { provide: OperationsService, useValue: {} },
        { provide: VideosService, useValue: { latest: () => ({ items: [] }) } },
        { provide: PlaylistVideosService, useValue: {} },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  beforeEach(() => {
    identity = { ...pending };
    account = { status: 'PENDING_APPROVAL', deletedAt: null };
    jest.clearAllMocks();
  });
  afterAll(async () => app.close());
  const get = (path: string) =>
    request(app.getHttpServer()).get(path).auth('test', { type: 'bearer' });
  const approve = () =>
    request(app.getHttpServer())
      .post(`/users/${pending.id}/approve`)
      .auth('test', { type: 'bearer' });
  it('requires authentication even for allowed content', async () => {
    await request(app.getHttpServer()).get('/videos').expect(401);
    await request(app.getHttpServer()).get('/community/birthdays').expect(401);
  });
  it('permits videos and birthdays but denies other endpoints even with stale elevated permissions', async () => {
    identity = { ...pending, permissions: [...PERMISSIONS], roles: ['ADMIN'] };
    await get('/videos').expect(200);
    await get('/community/birthdays').expect(200);
    for (const path of [
      '/restricted',
      '/community/dashboard',
      '/community/visitors',
      '/users',
      '/users/pending-approvals',
    ])
      await get(path).expect(403);
    await approve().expect(403);
    expect(user.findMany).not.toHaveBeenCalled();
  });
  it.each(['ADMIN', 'SUPER_ADMIN', 'PASTOR'])(
    'lets active %s list and approve, with a conflict on repeated approval',
    async (role) => {
      identity = { ...pending, status: 'ACTIVE', roles: [role] };
      await get('/users/pending-approvals?page=1&pageSize=20').expect(200);
      expect(user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PENDING_APPROVAL', deletedAt: null },
          take: 20,
        }),
      );
      await approve().expect(201);
      expect(userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: pending.id },
      });
      await approve().expect(409);
      expect(user.update).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects ordinary members and custom roles even with user-management permissions', async () => {
    identity = {
      ...pending,
      status: 'ACTIVE',
      roles: ['SECRETARY'],
      permissions: [...PERMISSIONS],
    };
    await get('/users/pending-approvals').expect(403);
    await approve().expect(403);
    expect(user.update).not.toHaveBeenCalled();
  });
  it('rejects deleted accounts and invalid pagination', async () => {
    identity = { ...pending, status: 'ACTIVE', roles: ['PASTOR'] };
    account.deletedAt = new Date();
    await approve().expect(404);
    await get('/users/pending-approvals?pageSize=1000').expect(400);
  });
  it('does not let the generic status endpoint bypass approval', async () => {
    identity = {
      ...pending,
      id: '22222222-2222-4222-8222-222222222222',
      status: 'ACTIVE',
      permissions: ['USER_UPDATE'],
    };
    Object.assign(account, { userRoles: [] });
    Object.assign(db, { $executeRaw: jest.fn() });
    await request(app.getHttpServer())
      .patch(`/users/${pending.id}/status`)
      .auth('test', { type: 'bearer' })
      .send({ status: 'ACTIVE' })
      .expect(409);
    expect(user.update).not.toHaveBeenCalled();
  });
});

describe('Public registration contract', () => {
  it.each([
    { phone: undefined },
    { birthDate: undefined },
    { phone: 'abc1234567' },
    { phone: '123' },
    { birthDate: '2001-02-29' },
    { birthDate: '1990-05-20T00:00:00Z' },
  ])('rejects missing or invalid details %j', async (invalid) => {
    expect(
      (await validate(plainToInstance(RegisterDto, { ...dto, ...invalid })))
        .length,
    ).toBeGreaterThan(0);
  });
  it('accepts a leap-day birthday and formatted phone', async () => {
    expect(
      await validate(
        plainToInstance(RegisterDto, { ...dto, birthDate: '2000-02-29' }),
      ),
    ).toEqual([]);
  });
  it('persists pending status and member details atomically; roles cannot grant access before approval', async () => {
    const create = jest
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        ...pending,
        ...data,
        userRoles: [],
      }));
    const db = {
      $transaction: (callback: (tx: unknown) => unknown) =>
        callback({ user: { create } }),
    };
    const auth = new AuthService(
      db as unknown as PrismaService,
      new JwtService(),
      new ConfigService({
        JWT_ACCESS_SECRET: 'a'.repeat(48),
        JWT_REFRESH_SECRET: 'b'.repeat(48),
      }),
      new PendingEmailDelivery(),
    );
    const result = await auth.register(dto);
    expect(result.status).toBe('PENDING_APPROVAL');
    expect(result.permissions).toEqual([]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING_APPROVAL',
          member: {
            create: {
              name: dto.name,
              email: dto.email,
              phone: dto.phone,
              birthDate: new Date(dto.birthDate),
            },
          },
        }),
      }),
    );
    expect(result).not.toHaveProperty('passwordHash');
    await expect(
      auth.register({ ...dto, birthDate: '2999-01-01' }),
    ).rejects.toThrow('futuro');
    const identity = {
      ...pending,
      userRoles: [
        {
          role: {
            name: 'ADMIN',
            permissions: PERMISSIONS.map((code) => ({ permission: { code } })),
          },
        },
      ],
    } as unknown as Parameters<typeof safeUser>[0];
    expect(safeUser(identity).permissions).toEqual([]);
    expect(
      safeUser({ ...identity, status: 'ACTIVE', userRoles: [] }).permissions,
    ).toEqual(expect.arrayContaining([...MEMBER_PERMISSIONS]));
    expect(
      (
        await auth.createAccount({
          name: dto.name,
          email: dto.email,
          password: dto.password,
        })
      ).status,
    ).toBe('ACTIVE');
  });
});

describe('Pending authentication lifecycle', () => {
  it('logs in, restores and rotates a pending session, then reads approval without replacing the JWT', async () => {
    const identity = {
      ...pending,
      passwordHash: await argon2.hash(dto.password),
      userRoles: [],
      deletedAt: null,
    };
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const session = {
      id: sessionId,
      userId: pending.id,
      user: identity,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60000),
      familyId: 'family',
    };
    const db = {
      $queryRaw: jest.fn(),
      user: {
        findUnique: jest.fn(() => identity),
        findUniqueOrThrow: jest.fn(() => identity),
      },
      authLoginThrottle: {
        findUnique: jest.fn(() => null),
        deleteMany: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(() => session),
        findUnique: jest.fn(() => session),
        findUniqueOrThrow: jest.fn(() => session),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      $transaction: (callback: (tx: unknown) => unknown): unknown =>
        callback(db),
    };
    const auth = new AuthService(
      db as unknown as PrismaService,
      new JwtService(),
      new ConfigService({
        JWT_ACCESS_SECRET: 'a'.repeat(48),
        JWT_REFRESH_SECRET: 'b'.repeat(48),
      }),
      new PendingEmailDelivery(),
    );
    const login = await auth.login(dto.email, dto.password);
    expect(login.user.status).toBe('PENDING_APPROVAL');
    expect(login.user.permissions).toEqual([]);
    expect((await auth.authenticate(login.accessToken)).user.status).toBe(
      'PENDING_APPROVAL',
    );
    expect((await auth.refresh(login.refreshToken)).user.permissions).toEqual(
      [],
    );
    Object.assign(identity, { status: 'ACTIVE' });
    expect(
      (await auth.authenticate(login.accessToken)).user.permissions,
    ).toEqual(expect.arrayContaining([...MEMBER_PERMISSIONS]));
    Object.assign(identity, { status: 'DISABLED' });
    await expect(auth.authenticate(login.accessToken)).rejects.toThrow();
    await expect(auth.refresh(login.refreshToken)).rejects.toThrow();
  });
});

describe('Pending member access transitions', () => {
  it('does not allow member deactivation to bypass the approval workflow', async () => {
    const update = jest.fn();
    const db = {
      $queryRaw: jest.fn(),
      member: {
        findUnique: jest.fn(() => ({ id: 'member', status: 'ACTIVE' })),
        update,
      },
      user: {
        findUnique: jest.fn(() => ({ ...pending, userRoles: [] })),
        update,
      },
      $transaction: (callback: (tx: unknown) => unknown): unknown =>
        callback(db),
    };
    const service = new MembersService(db as unknown as PrismaService);
    await expect(
      service.update(
        'member',
        { status: 'INACTIVE' },
        {
          ...pending,
          id: 'manager',
          status: 'ACTIVE',
          permissions: ['USER_UPDATE', 'MEMBER_UPDATE'],
        },
      ),
    ).rejects.toThrow('lista de espera');
    expect(update).not.toHaveBeenCalled();
  });
});
