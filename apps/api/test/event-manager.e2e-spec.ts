import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { ROLE_PERMISSIONS } from '@church/shared';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('EVENT_MANAGER RBAC and event scope (isolated PostgreSQL)', () => {
  const schema = 'event_manager_test_' + randomUUID().replaceAll('-', '');
  let app: INestApplication, db: PrismaClient;
  let manager: { id: string; token: string },
    admin: { id: string; token: string },
    other: { id: string; token: string };
  let ownId: string,
    otherId: string,
    registrationId: string,
    otherRegistrationId: string,
    paymentId: string,
    otherPaymentId: string,
    refundId: string;
  const call = (
    method: 'get' | 'post' | 'patch',
    path: string,
    body: object = {},
    token = manager.token,
  ) => {
    const server = request(app.getHttpServer());
    return server[method]('/api/v1' + path)
      .auth(token, { type: 'bearer' })
      .send(body);
  };
  const event = {
    title: 'Evento de teste',
    type: 'OTHER',
    location: 'Igreja',
    startDateTime: '2027-01-01T10:00:00Z',
    endDateTime: '2027-01-01T18:00:00Z',
    capacity: 10,
  };
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error('TEST_DATABASE_URL required');
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('hex');
    process.env.JWT_REFRESH_SECRET = randomBytes(48).toString('hex');
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: process.env, stdio: 'pipe' },
    );
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
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
    async function user(roleName: string) {
      const email = randomUUID() + '@events.example',
        password = 'Events-test-password-2026';
      const registered = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ name: 'Event test', email, password })
        .expect(201);
      const role = await db.role.upsert({
        where: { name: roleName },
        create: { name: roleName },
        update: {},
      });
      await db.userRole.create({
        data: { userId: registered.body.id as string, roleId: role.id },
      });
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      return {
        id: registered.body.id as string,
        token: login.body.accessToken as string,
      };
    }
    manager = await user('EVENT_MANAGER');
    other = await user('EVENT_MANAGER');
    admin = await user('SUPER_ADMIN');
    // Populate established administrator grants as production migration history does.
    const role = await db.role.findUniqueOrThrow({
      where: { name: 'SUPER_ADMIN' },
    });
    for (const code of ROLE_PERMISSIONS.SUPER_ADMIN) {
      const permission = await db.permission.upsert({
        where: { code },
        create: { code },
        update: {},
      });
      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
    ownId = (await call('post', '/events', event).expect(201)).body
      .id as string;
    otherId = (await call('post', '/events', event, other.token).expect(201))
      .body.id as string;
    const member = await db.member.create({ data: { name: 'Participante' } });
    registrationId = (
      await call('post', `/events/${ownId}/registrations`, {
        memberId: member.id,
      }).expect(201)
    ).body.id as string;
    otherRegistrationId = (
      await db.eventRegistration.create({
        data: { eventId: otherId, memberId: member.id },
      })
    ).id;
    paymentId = (
      await db.eventPayment.create({
        data: {
          eventId: ownId,
          registrationId,
          amount: 100,
          discount: 10,
          gatewayFee: 2,
          status: 'CONFIRMED',
        },
      })
    ).id;
    otherPaymentId = (
      await db.eventPayment.create({
        data: {
          eventId: otherId,
          registrationId: otherRegistrationId,
          amount: 200,
          status: 'CONFIRMED',
        },
      })
    ).id;
  }, 60000);
  afterAll(async () => {
    if (app) await app.close();
    if (db) {
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.$disconnect();
    }
  });
  it('seeds exactly the allowed event permissions, with presentation name', async () => {
    const role = await db.role.findUniqueOrThrow({
      where: { name: 'EVENT_MANAGER' },
      include: { permissions: { include: { permission: true } } },
    });
    expect(role.displayName).toBe('Gestor de Eventos');
    expect(role.permissions.map((p) => p.permission.code).sort()).toEqual(
      [...ROLE_PERMISSIONS.EVENT_MANAGER].sort(),
    );
  });
  it('creates an event and atomically assigns its creator', async () => {
    expect(
      await db.eventManagerAssignment.findFirst({
        where: { eventId: ownId, userId: manager.id, revokedAt: null },
      }),
    ).not.toBeNull();
    await call('patch', `/events/${ownId}`, { title: 'Alterado' }).expect(200);
    await call('post', `/events/${ownId}/publish`).expect(201);
  });
  it('rejects unassigned events across detail, writes, lists, search and export', async () => {
    await call('get', `/events/${otherId}`).expect(404);
    await call('patch', `/events/${otherId}`, { title: 'IDOR' }).expect(404);
    await call('get', `/events/${otherId}/reports/export`).expect(404);
    const list = await call('get', '/events?search=Evento').expect(200);
    expect(list.body.items.map((r: { id: string }) => r.id)).not.toContain(
      otherId,
    );
    const legacy = await call('get', '/community/events').expect(200);
    expect(legacy.body.items.map((r: { id: string }) => r.id)).not.toContain(
      otherId,
    );
  });
  it('cannot self-assign or revoke other managers', async () => {
    await call('post', `/events/${otherId}/managers`, {
      userId: manager.id,
    }).expect(403);
    await call('post', `/events/${ownId}/managers/revoke`, {
      userId: manager.id,
    }).expect(403);
  });
  it('reads only own event payments with explicit safe projection and financial report', async () => {
    const result = await call('get', `/events/${ownId}/payments`).expect(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].amount).toBe('100.00');
    expect(result.body.items[0]).not.toHaveProperty('gatewaySecret');
    await call('get', `/events/${otherId}/payments`).expect(404);
    const report = await call('get', `/events/${ownId}/reports/export`).expect(
      200,
    );
    expect(report.body.finances[0].net).toBe('88.00');
  });
  it.each([
    '/finance/contributions',
    '/finance/banking/imports',
    '/finance/banking/transactions',
    '/users',
    '/users/roles',
    '/audit',
  ])('denies global endpoint %s', async (path) => {
    await call('get', path).expect(403);
  });
  it('denies bank imports and user/role mutations', async () => {
    await call('post', '/finance/banking/imports').expect(403);
    await call('patch', `/users/${other.id}/status`, {
      status: 'DISABLED',
    }).expect(403);
    await call('patch', `/users/${other.id}/roles`, { roleIds: [] }).expect(
      403,
    );
  });
  it('requests refunds but cannot approve without additional permission', async () => {
    refundId = (
      await call('post', `/events/${ownId}/payments/${paymentId}/refunds`, {
        reason: 'Desistência',
      }).expect(201)
    ).body.id as string;
    await call('post', `/events/${ownId}/refunds/${refundId}/approve`).expect(
      403,
    );
    await call('post', `/events/${ownId}/payments/${otherPaymentId}/refunds`, {
      reason: 'IDOR',
    }).expect(404);
    await call(
      'post',
      `/events/${ownId}/refunds/${refundId}/approve`,
      {},
      admin.token,
    ).expect(201);
  });
  it('rejects manipulated registration, ticket, QR and session IDs', async () => {
    await call(
      'post',
      `/events/${ownId}/registrations/${otherRegistrationId}/approve`,
    ).expect(404);
    await call(
      'post',
      `/events/${ownId}/registrations/${otherRegistrationId}/cancel`,
    ).expect(404);
    const foreign = await db.eventRegistration.findUniqueOrThrow({
      where: { id: otherRegistrationId },
    });
    await call('post', `/events/${ownId}/checkin`, {
      qrToken: foreign.qrToken,
    }).expect(404);
    const ticket = await db.eventTicket.create({
      data: {
        eventId: otherId,
        name: 'Outro',
        price: 10,
        capacity: 20,
        startsAt: new Date(event.startDateTime),
        endsAt: new Date(event.endDateTime),
      },
    });
    await call('patch', `/events/${ownId}/tickets/${ticket.id}`, {
      name: 'IDOR',
      price: 0,
      capacity: 1,
      startsAt: event.startDateTime,
      endsAt: event.endDateTime,
    }).expect(404);
    const session = await db.eventSession.create({
      data: {
        eventId: otherId,
        name: 'Outro',
        startsAt: new Date(event.startDateTime),
        endsAt: new Date(event.endDateTime),
      },
    });
    const own = await db.eventRegistration.findUniqueOrThrow({
      where: { id: registrationId },
    });
    await call('post', `/events/${ownId}/checkin`, {
      qrToken: own.qrToken,
      sessionId: session.id,
    }).expect(404);
  });
  it('manages coupons, approval, attendance, communication and audited exports', async () => {
    await call('post', `/events/${ownId}/coupons`, {
      code: 'CORTESIA',
      discountPercent: 100,
    }).expect(201);
    await call(
      'post',
      `/events/${ownId}/registrations/${registrationId}/approve`,
    ).expect(201);
    const row = await db.eventRegistration.findUniqueOrThrow({
      where: { id: registrationId },
    });
    await call('post', `/events/${ownId}/checkin`, {
      qrToken: row.qrToken,
    }).expect(201);
    await call('post', `/events/${ownId}/checkin/reverse`, {
      qrToken: row.qrToken,
    }).expect(201);
    await call('post', `/events/${ownId}/notifications`, {
      subject: 'Evento',
      content: 'Bem-vindo',
    }).expect(201);
    expect(
      await db.notification.count({
        where: { subject: 'Evento', status: 'SENT' },
      }),
    ).toBe(1);
    const actions = await db.auditLog.findMany({
      where: { entityId: ownId },
      select: { action: true },
    });
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'EVENT_PUBLISHED',
        'EVENT_COURTESY_GRANTED',
        'EVENT_REGISTRATION_APPROVED',
        'EVENT_CHECKIN_REVERSED',
        'EVENT_REPORT_EXPORTED',
        'EVENT_REFUND_REQUESTED',
      ]),
    );
  });
  it('revocation immediately removes creator access with the same session; admins retain access', async () => {
    await call(
      'post',
      `/events/${ownId}/managers/revoke`,
      { userId: manager.id },
      admin.token,
    ).expect(201);
    await call('get', `/events/${ownId}`).expect(404);
    await call('get', `/events/${ownId}/payments`).expect(404);
    await call('patch', `/operations/events/${ownId}`, {
      title: 'Revogado',
    }).expect(404);
    const list = await call('get', '/events').expect(200);
    expect(list.body.items).toHaveLength(0);
    await call('get', `/events/${ownId}`, {}, admin.token).expect(200);
    await call('get', `/events/${otherId}`, {}, admin.token).expect(200);
    await call(
      'post',
      `/events/${ownId}/managers`,
      { userId: manager.id },
      admin.token,
    ).expect(201);
    await call('get', `/events/${ownId}`).expect(200);
  });
});
