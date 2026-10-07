import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  PasswordResetDelivery,
  PasswordResetMessage,
} from '../src/modules/auth/password-reset.delivery';

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('Authentication and members (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const suffix = randomUUID();
  const password = 'Testing-only-password-2026';
  const emails: string[] = [];
  const memberIds: string[] = [];
  const roleIds: string[] = [];
  const deliveries: PasswordResetMessage[] = [];
  let adminToken: string;
  let normalId: string;
  let normalToken: string;
  let adminId: string;
  let sequence = 0;

  function email() {
    const value = `test-${suffix}-${sequence++}@ponte.example`;
    emails.push(value);
    return value;
  }

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const cookie = (response: request.Response) => {
    const cookies = response.headers['set-cookie'] as string[] | undefined;
    const value = cookies?.[0]?.split(';')[0];
    if (!value) throw new Error('Missing refresh cookie');
    return value;
  };
  const register = (address: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: address, name: 'Test User', password });
  const login = (address: string, pass = password) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: address, password: pass });

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('hex');
    process.env.JWT_REFRESH_SECRET = randomBytes(48).toString('hex');
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: async () => ({
          totalHits: 1,
          timeToExpire: 60000,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .overrideProvider(PasswordResetDelivery)
      .useValue({
        send: async (message: PasswordResetMessage) => {
          deliveries.push(message);
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    const adminEmail = email();
    const admin = await register(adminEmail).expect(201);
    adminId = admin.body.id as string;
    const codes = [
      'USER_READ',
      'USER_CREATE',
      'USER_UPDATE',
      'MEMBER_READ',
      'MEMBER_CREATE',
      'MEMBER_UPDATE',
      'MEMBER_DELETE',
    ];
    for (const code of codes)
      await db.permission.upsert({
        where: { code },
        create: { code },
        update: {},
      });
    const permissions = await db.permission.findMany({
      where: { code: { in: codes } },
    });
    const role = await db.role.create({
      data: {
        name: `test-admin-${suffix.slice(0, 24)}`,
        permissions: {
          create: permissions.map((permission) => ({
            permissionId: permission.id,
          })),
        },
      },
    });
    roleIds.push(role.id);
    await db.userRole.create({ data: { userId: adminId, roleId: role.id } });
    adminToken = (await login(adminEmail).expect(200)).body
      .accessToken as string;
    const address = email();
    normalId = (await register(address).expect(201)).body.id as string;
    normalToken = (await login(address).expect(200)).body.accessToken as string;
  }, 30000);

  afterAll(async () => {
    if (db) {
      const users = await db.user.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      });
      const ids = users.map(({ id }) => id);
      await db.passwordReset.deleteMany({ where: { userId: { in: ids } } });
      await db.refreshToken.deleteMany({ where: { userId: { in: ids } } });
      await db.userRole.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
      await db.rolePermission.deleteMany({
        where: { roleId: { in: roleIds } },
      });
      await db.role.deleteMany({ where: { id: { in: roleIds } } });
      await db.member.deleteMany({ where: { id: { in: memberIds } } });
      await db.$disconnect();
    }
    await app?.close();
  });

  it('registers a normal user, hashes the password and never accepts roles or permissions', async () => {
    const address = email();
    const response = await register(address).expect(201);
    expect(response.body.permissions).toEqual([]);
    expect(response.body.passwordHash).toBeUndefined();
    const user = await db.user.findUniqueOrThrow({ where: { email: address } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(user.passwordHash, password)).toBe(true);
    await register(address).expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: email(), name: 'Attack', password, roles: ['ADMIN'] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: email(),
        name: 'Attack',
        password,
        permissions: ['USER_UPDATE'],
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'bad', name: ' ', password: 'short' })
      .expect(400);
  });

  it('validates login, cookie attributes, JWT identity and avoids sensitive response fields', async () => {
    const address = email();
    await register(address).expect(201);
    await login(address, 'wrong').expect(401);
    await login(email()).expect(401);
    const response = await login(address).expect(200);
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(response.headers['set-cookie']?.[0]).toContain('SameSite=Strict');
    expect(response.body.refreshToken).toBeUndefined();
    expect(response.body.user.passwordHash).toBeUndefined();
    const stored = await db.refreshToken.findFirstOrThrow({
      where: { userId: response.body.user.id as string },
    });
    expect(stored.tokenHash).not.toContain(cookie(response).split('=')[1]);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(bearer(response.body.accessToken as string))
      .expect(200)
      .expect((result) => {
        expect(result.body.id).toBe(response.body.user.id);
        expect(result.body.permissions).toEqual([]);
      });
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(bearer('tampered'))
      .expect(401);
  });

  it('rotates refresh tokens, invalidates old access and revokes the family on replay', async () => {
    const address = email();
    await register(address);
    const first = await login(address).expect(200);
    const next = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie(first))
      .expect(200);
    expect(cookie(next)).not.toBe(cookie(first));
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(bearer(first.body.accessToken as string))
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(bearer(next.body.accessToken as string))
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie(first))
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie(next))
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(bearer(next.body.accessToken as string))
      .expect(401);
  });

  it('serializes concurrent refresh requests and revokes a raced family', async () => {
    const address = email();
    await register(address);
    const first = await login(address);
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('Cookie', cookie(first)),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
    const next = results.find((result) => result.status === 200);
    if (!next) throw new Error('No rotation result');
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(bearer(next.body.accessToken as string))
      .expect(401);
  });

  it('serializes logout with refresh so no raced session survives logout', async () => {
    const address = email();
    await register(address).expect(201);
    const first = await login(address).expect(200);
    const [rotation] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie(first)),
      request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie(first))
        .expect(204),
    ]);
    expect([200, 401]).toContain(rotation.status);
    if (rotation.status === 200) {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(bearer(rotation.body.accessToken as string))
        .expect(401);
    }
    const remaining = await db.refreshToken.count({
      where: { userId: first.body.user.id as string, revokedAt: null },
    });
    expect(remaining).toBe(0);
  });

  it('rejects expired refresh and cross-origin cookie requests; logout revokes access', async () => {
    const address = email();
    await register(address);
    const first = await login(address);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie(first))
      .set('Origin', 'https://attacker.invalid')
      .expect(403);
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie(first))
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(bearer(first.body.accessToken as string))
      .expect(401);
    const second = await login(address);
    await db.refreshToken.updateMany({
      where: { userId: second.body.user.id as string },
      data: { expiresAt: new Date(0) },
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie(second))
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(bearer(second.body.accessToken as string))
      .expect(401);
  });

  it('changes only the authenticated password and revokes every session', async () => {
    const address = email();
    await register(address);
    const first = await login(address);
    const second = await login(address);
    await request(app.getHttpServer())
      .patch('/api/v1/auth/password')
      .set(bearer(first.body.accessToken as string))
      .send({ currentPassword: 'wrong', newPassword: password + 'new' })
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/auth/password')
      .set(bearer(first.body.accessToken as string))
      .send({
        currentPassword: password,
        newPassword: password + 'new',
        userId: normalId,
      })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/v1/auth/password')
      .set(bearer(first.body.accessToken as string))
      .send({ currentPassword: password, newPassword: password + 'new' })
      .expect(204);
    await login(address).expect(401);
    await login(address, password + 'new').expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie(second))
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(bearer(second.body.accessToken as string))
      .expect(401);
  });

  it('returns generic recovery responses; reset is hashed, expiring, single-use and revokes sessions', async () => {
    const address = email();
    await register(address);
    const session = await login(address);
    const unknown = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: email() })
      .expect(200);
    const known = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: address })
      .expect(200);
    expect(known.body).toEqual(unknown.body);
    expect(known.body.token).toBeUndefined();
    const message = deliveries.find((item) => item.email === address);
    if (!message) throw new Error('Delivery adapter did not receive token');
    const reset = await db.passwordReset.findFirstOrThrow({
      where: { userId: session.body.user.id as string },
    });
    expect(reset.tokenHash).not.toBe(message.token);
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({
        token: randomBytes(32).toString('base64url'),
        newPassword: password + 'reset',
      })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: message.token, newPassword: password + 'reset' })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: message.token, newPassword: password + 'reset' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie(session))
      .expect(401);
    await login(address, password + 'reset').expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: address });
    const expired = deliveries.at(-1);
    await db.passwordReset.updateMany({
      where: { userId: session.body.user.id as string },
      data: { expiresAt: new Date(0) },
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: expired?.token, newPassword: password })
      .expect(401);
  });

  it('enforces backend permissions on every member/user operation and denies horizontal access', async () => {
    for (const url of ['/api/v1/members', '/api/v1/users']) {
      await request(app.getHttpServer()).get(url).expect(401);
      await request(app.getHttpServer())
        .get(url)
        .set(bearer(normalToken))
        .expect(403);
    }
    const id = randomUUID();
    await request(app.getHttpServer())
      .get(`/api/v1/members/${id}`)
      .set(bearer(normalToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/members')
      .set(bearer(normalToken))
      .send({ name: 'No access' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/members/${id}`)
      .set(bearer(normalToken))
      .send({ name: 'No access' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/v1/members/${id}`)
      .set(bearer(normalToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set(bearer(normalToken))
      .send({ name: 'No access', email: email(), password })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${adminId}/status`)
      .set(bearer(normalToken))
      .send({ status: 'DISABLED' })
      .expect(403);
  });

  it('supports member CRUD, search/filter, exact pagination and deterministic sorting', async () => {
    const names = ['A', 'C', 'B'];
    for (const name of names) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/members')
        .set(bearer(adminToken))
        .send({
          name: `${suffix}-${name}`,
          email: `${name.toLowerCase()}@ponte.example`,
          status: name === 'C' ? 'INACTIVE' : 'ACTIVE',
          birthDate: '2000-02-29',
        })
        .expect(201);
      memberIds.push(response.body.id as string);
    }
    const response = await request(app.getHttpServer())
      .get('/api/v1/members')
      .set(bearer(adminToken))
      .query({
        search: suffix,
        status: 'ACTIVE',
        page: 2,
        pageSize: 1,
        sortBy: 'name',
        sortOrder: 'desc',
      })
      .expect(200);
    expect(response.body).toMatchObject({
      total: 2,
      page: 2,
      pageSize: 1,
      items: [{ name: `${suffix}-A` }],
    });
    expect(response.body.items).toHaveLength(1);
    const id = memberIds[0];
    await request(app.getHttpServer())
      .get(`/api/v1/members/${id}`)
      .set(bearer(adminToken))
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/members/${id}`)
      .set(bearer(adminToken))
      .send({ name: 'Edited', email: null, birthDate: null, notes: 'Note' })
      .expect(200)
      .expect((result) => {
        expect(result.body).toMatchObject({
          name: 'Edited',
          email: null,
          birthDate: null,
          notes: 'Note',
        });
      });
    await request(app.getHttpServer())
      .delete(`/api/v1/members/${id}`)
      .set(bearer(adminToken))
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/v1/members/${id}`)
      .set(bearer(adminToken))
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/members/${id}`)
      .set(bearer(adminToken))
      .send({ name: 'Missing' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/members/${id}`)
      .set(bearer(adminToken))
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/members/not-a-uuid')
      .set(bearer(adminToken))
      .expect(400);
  });

  it('rejects invalid filters, pagination, sort injection, impossible dates and null required fields', async () => {
    for (const query of [
      { page: 0 },
      { pageSize: 101 },
      { page: 1.5 },
      { sortBy: 'passwordHash' },
      { sortOrder: 'DROP' },
      { status: 'BAD' },
    ]) {
      await request(app.getHttpServer())
        .get('/api/v1/members')
        .set(bearer(adminToken))
        .query(query)
        .expect(400);
    }
    for (const dto of [
      { name: ' ' },
      { name: 'Bad', birthDate: '2025-02-30' },
      { name: 'Bad', status: null },
      { name: 'Bad', role: 'ADMIN' },
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/members')
        .set(bearer(adminToken))
        .send(dto)
        .expect(400);
    }
    await request(app.getHttpServer())
      .patch(`/api/v1/members/${memberIds[1]}`)
      .set(bearer(adminToken))
      .send({ name: null })
      .expect(400);
  });

  it('creates only normal users and disables/reactivates accounts without restoring sessions', async () => {
    const address = email();
    const created = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set(bearer(adminToken))
      .send({ name: 'Managed', email: address, password })
      .expect(201);
    expect(created.body.permissions).toEqual([]);
    const id = created.body.id as string;
    const first = await login(address);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'DISABLED' })
      .expect(200);
    await login(address).expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(bearer(first.body.accessToken as string))
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie(first))
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'ACTIVE' })
      .expect(200);
    await login(address).expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(bearer(first.body.accessToken as string))
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${adminId}/status`)
      .set(bearer(adminToken))
      .send({ status: 'DISABLED' })
      .expect(409);
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set(bearer(adminToken))
      .query({ search: address, page: 1, pageSize: 1 })
      .expect(200)
      .expect((result) => {
        expect(result.body.total).toBe(1);
        expect(result.body.items[0].passwordHash).toBeUndefined();
      });
  });

  it('reads permissions from the database on every request, not from stale JWT claims', async () => {
    const address = email();
    const user = await register(address).expect(201);
    const userId = user.body.id as string;
    const roleId = roleIds[0];
    if (!roleId) throw new Error('No test role');
    await db.userRole.create({ data: { userId, roleId } });
    const session = await login(address).expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/members')
      .set(bearer(session.body.accessToken as string))
      .expect(200);
    await db.userRole.delete({
      where: { userId_roleId: { userId, roleId } },
    });
    await request(app.getHttpServer())
      .get('/api/v1/members')
      .set(bearer(session.body.accessToken as string))
      .expect(403);
  });
});
