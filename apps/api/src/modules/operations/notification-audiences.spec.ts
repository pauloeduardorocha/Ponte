import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { CurrentUser } from '@church/shared';
import { Notification } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../database/prisma.service';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { PermissionGuard } from '../auth/permission.guard';

const ids = [
  '63b80123-eefa-4f48-a877-6cfdcdd4b724',
  '73b80123-eefa-4f48-a877-6cfdcdd4b724',
];
const base = { channel: 'INTERNAL', content: 'Aviso' };

describe('Notification audiences HTTP contract (mocked database)', () => {
  let app: INestApplication;
  let user: CurrentUser;
  let service: OperationsService;
  const records = new Map<string, Notification>();
  const provider = { channel: 'INTERNAL', send: jest.fn() };
  const db = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn() },
    member: { findMany: jest.fn(), findFirst: jest.fn() },
    visitor: { findFirst: jest.fn() },
    smallGroup: { findMany: jest.fn() },
    ministry: { findMany: jest.fn() },
    role: { count: jest.fn(), findMany: jest.fn() },
    notification: {
      createManyAndReturn: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  beforeAll(async () => {
    service = new OperationsService(db as unknown as PrismaService, [provider]);
    const module = await Test.createTestingModule({
      controllers: [OperationsController],
      providers: [
        { provide: OperationsService, useValue: service },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req: { user: CurrentUser }, _res: unknown, next: () => void) => {
      req.user = user;
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    records.clear();
    user = {
      id: ids[0],
      permissions: ['NOTIFICATION_SEND', 'OPERATION_SCOPE_ALL'],
    } as CurrentUser;
    db.$transaction.mockImplementation(async (fn) =>
      Array.isArray(fn) ? Promise.all(fn) : fn(db),
    );
    db.user.findUnique.mockResolvedValue({ memberId: ids[0] });
    db.member.findMany.mockResolvedValue(ids.map((id) => ({ id })));
    db.member.findFirst.mockResolvedValue({ id: ids[0] });
    db.visitor.findFirst.mockResolvedValue({ id: ids[0] });
    db.smallGroup.findMany.mockResolvedValue(
      ids.map((id) => ({ id, leaderMemberId: ids[0] })),
    );
    db.ministry.findMany.mockResolvedValue([
      { id: ids[0], leaderMemberId: ids[0] },
    ]);
    db.role.count.mockResolvedValue(1);
    db.notification.createManyAndReturn.mockImplementation(async ({ data }) =>
      data.map((row: Notification, i: number) => {
        const n = { ...row, id: ids[i], status: 'PENDING' } as Notification;
        records.set(n.id, n);
        return { id: n.id };
      }),
    );
    db.notification.findFirst.mockImplementation(async ({ where }) =>
      records.get(where.id),
    );
    db.notification.update.mockImplementation(async ({ where, data }) => ({
      ...records.get(where.id),
      ...data,
    }));
    provider.send.mockResolvedValue(undefined);
  });
  it('sends once per selected active member and reports independent provider failures', async () => {
    provider.send.mockRejectedValueOnce(new Error('provider failed'));
    await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...base, smallGroupIds: ids })
      .expect(201, {
        total: 2,
        sent: 1,
        failed: 1,
        pending: 0,
        status: 'PARTIAL',
      });
    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(db.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          anonymizedAt: null,
          OR: expect.arrayContaining([
            {
              groupMemberships: {
                some: { smallGroupId: { in: ids }, active: true, leftAt: null },
              },
            },
          ]),
        }),
      }),
    );
    const rows = db.notification.createManyAndReturn.mock.calls[0][0].data;
    expect(rows.map((r: Notification) => r.recipientMemberId)).toEqual(ids);
    expect(rows[0]).not.toHaveProperty('smallGroupIds');
  });
  it.each([{ allMembers: true }, { roleIds: [ids[0]] }])(
    'restricts global audience %j',
    async (audience) => {
      user.permissions = ['NOTIFICATION_SEND'];
      await request(app.getHttpServer())
        .post('/operations/notifications')
        .send({ ...base, ...audience })
        .expect(403);
      expect(db.notification.createManyAndReturn).not.toHaveBeenCalled();
    },
  );
  it('refuses an inaccessible group without creating any notifications', async () => {
    user.permissions = ['NOTIFICATION_SEND'];
    db.smallGroup.findMany.mockResolvedValue([]);
    await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...base, smallGroupIds: [ids[1]] })
      .expect(404);
    expect(db.smallGroup.findMany.mock.calls[0][0].where.AND[0]).toEqual({
      OR: [
        { leaderMemberId: ids[0] },
        { coLeaderMemberId: ids[0] },
        { hostMemberId: ids[0] },
      ],
    });
    expect(db.notification.createManyAndReturn).not.toHaveBeenCalled();
  });
  it('selects current ministry participants and includes the leader', async () => {
    await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...base, ministryIds: [ids[0]] })
      .expect(201);
    expect(db.member.findMany.mock.calls[0][0].where.OR).toEqual([
      {
        ministryMemberships: {
          some: { ministryId: { in: [ids[0]] }, active: true, leftAt: null },
        },
      },
      { id: { in: [ids[0]] } },
    ]);
  });
  it('selects roles through active accounts linked to members', async () => {
    await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...base, roleIds: [ids[0]] })
      .expect(201);
    expect(db.member.findMany.mock.calls[0][0].where.OR).toEqual([
      {
        user: {
          status: 'ACTIVE',
          deletedAt: null,
          userRoles: { some: { roleId: { in: [ids[0]] } } },
        },
      },
    ]);
  });
  it('schedules all active members without calling a provider', async () => {
    await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...base, allMembers: true, scheduledAt: '2099-01-01T12:00:00Z' })
      .expect(201, {
        total: 2,
        sent: 0,
        failed: 0,
        pending: 2,
        status: 'PENDING',
      });
    expect(provider.send).not.toHaveBeenCalled();
    expect(db.member.findMany.mock.calls[0][0].where).toEqual({
      status: 'ACTIVE',
      anonymizedAt: null,
    });
  });
  it.each([
    {},
    { smallGroupIds: [] },
    { ministryIds: ['bad'] },
    { allMembers: 'true' },
    { allMembers: true, recipientMemberId: ids[0] },
    { roleIds: [ids[0]], ministryIds: [ids[0]] },
  ])('rejects invalid or ambiguous audience %j', async (audience) => {
    await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...base, ...audience })
      .expect(400);
    expect(db.notification.createManyAndReturn).not.toHaveBeenCalled();
  });
  it('rejects an empty audience result', async () => {
    db.member.findMany.mockResolvedValue([]);
    await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...base, allMembers: true })
      .expect(400);
    expect(db.notification.createManyAndReturn).not.toHaveBeenCalled();
  });
  it.each(['recipientMemberIds', 'recipientVisitorIds'])(
    'sends to multiple explicit recipients via %s without repeating IDs',
    async (key) => {
      await request(app.getHttpServer())
        .post('/operations/notifications')
        .send({ ...base, [key]: [ids[0], ids[1], ids[0]] })
        .expect(201, {
          total: 2,
          sent: 2,
          failed: 0,
          pending: 0,
          status: 'SENT',
        });
      const rows = db.notification.createManyAndReturn.mock.calls[0][0].data;
      const recipientKey =
        key === 'recipientMemberIds'
          ? 'recipientMemberId'
          : 'recipientVisitorId';
      expect(
        rows.map((row: Record<string, unknown>) => row[recipientKey]),
      ).toEqual(ids);
      expect(rows[0]).not.toHaveProperty(key);
      expect(provider.send).toHaveBeenCalledTimes(2);
    },
  );
  it('refuses the whole member selection when a recipient is outside the sender scope', async () => {
    user.permissions = ['NOTIFICATION_SEND'];
    db.member.findFirst
      .mockResolvedValueOnce({ id: ids[0] })
      .mockResolvedValueOnce({ id: ids[0] })
      .mockResolvedValueOnce({ id: ids[1] })
      .mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...base, recipientMemberIds: ids })
      .expect(404);
    expect(db.notification.createManyAndReturn).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  });
  it('refuses the whole visitor selection when a recipient is inaccessible', async () => {
    db.visitor.findFirst
      .mockResolvedValueOnce({ id: ids[0] })
      .mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...base, recipientVisitorIds: ids })
      .expect(404);
    expect(db.notification.createManyAndReturn).not.toHaveBeenCalled();
  });
  it.each([
    { recipientMemberIds: [] },
    { recipientVisitorIds: ['invalid'] },
    { recipientMemberIds: [ids[0]], recipientMemberId: ids[1] },
    { recipientMemberIds: [ids[0]], recipientVisitorIds: [ids[1]] },
    { recipientMemberIds: Array(101).fill(ids[0]) },
  ])('rejects malformed or mixed explicit selections %j', async (audience) => {
    await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...base, ...audience })
      .expect(400);
    expect(db.notification.createManyAndReturn).not.toHaveBeenCalled();
  });
  it('requires notification send permission for sending and audience lookup', async () => {
    user.permissions = ['OPERATION_SCOPE_ALL'];
    await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...base, allMembers: true })
      .expect(403);
    await request(app.getHttpServer())
      .get('/operations/notification-audiences/small-groups')
      .expect(403);
  });
  it('restricts role lookup and validates audience lookup kind', async () => {
    user.permissions = ['NOTIFICATION_SEND'];
    await request(app.getHttpServer())
      .get('/operations/notification-audiences/roles')
      .expect(403);
    await request(app.getHttpServer())
      .get('/operations/notification-audiences/unknown')
      .expect(400);
  });
  it('paginates role options and returns their display names with only send and global scope permissions', async () => {
    db.role.findMany.mockResolvedValue([
      { id: ids[0], name: 'LEADER', displayName: 'Líder' },
    ]);
    await request(app.getHttpServer())
      .get(
        '/operations/notification-audiences/roles?search=L%C3%ADder&page=2&pageSize=1',
      )
      .expect(200, {
        items: [{ id: ids[0], name: 'Líder' }],
        total: 1,
        page: 2,
        pageSize: 1,
      });
    expect(db.role.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 1,
        take: 1,
        where: {
          OR: [
            { name: { contains: 'Líder', mode: 'insensitive' } },
            { displayName: { contains: 'Líder', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });
});
