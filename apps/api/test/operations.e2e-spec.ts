import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '@church/shared';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import {
  InternalNotificationProvider,
  NOTIFICATION_PROVIDERS,
} from '../src/modules/operations/notification.provider';
import { AppModule } from '../src/app.module';
describe('Church operations with isolated PostgreSQL', () => {
  const schema = 'operations_test_' + randomUUID().replaceAll('-', '');
  let app: INestApplication,
    db: PrismaClient,
    token: string,
    leaderToken: string,
    normalToken: string;
  let actorId: string,
    leaderUserId: string,
    leaderId: string,
    otherId: string,
    thirdId: string;
  const call = (
    method: 'get' | 'post' | 'patch',
    path: string,
    body?: object,
    auth = token,
  ) => {
    const server = request(app.getHttpServer());
    return server[method]('/api/v1' + path)
      .auth(auth, { type: 'bearer' })
      .send(body ?? {});
  };
  const post = (path: string, body: object, auth = token) =>
    call('post', '/operations' + path, body, auth);
  const get = (path: string, auth = token) =>
    call('get', '/operations' + path, undefined, auth);
  const patch = (path: string, body: object, auth = token) =>
    call('patch', '/operations' + path, body, auth);
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
      .overrideProvider(NOTIFICATION_PROVIDERS)
      .useValue([
        new InternalNotificationProvider(),
        {
          channel: 'SMS',
          send: async () => {
            throw new Error('Sensitive provider credential');
          },
        },
      ])
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
    async function user(codes: string[]) {
      const email = randomUUID() + '@operations.example',
        password = 'Operations-test-password-2026';
      const registered = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ name: 'Operations test', email, password })
        .expect(201);
      await db.permission.createMany({
        data: codes.map((code) => ({ code })),
        skipDuplicates: true,
      });
      const permissions = await db.permission.findMany({
        where: { code: { in: codes } },
      });
      const role = await db.role.create({
        data: {
          name: randomUUID(),
          permissions: {
            create: permissions.map((p) => ({ permissionId: p.id })),
          },
        },
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
    const actor = await user(
      PERMISSIONS.filter((p) => !p.startsWith('FINANCE_')),
    );
    actorId = actor.id;
    token = actor.token;
    const leader = await user([
      'VISITOR_READ',
      'VISITOR_CREATE',
      'VISITOR_UPDATE',
      'FOLLOWUP_READ',
      'FOLLOWUP_CREATE',
      'FOLLOWUP_UPDATE',
      'SMALL_GROUP_READ',
      'SMALL_GROUP_MANAGE',
      'MINISTRY_READ',
      'MINISTRY_MANAGE',
      'EVENT_READ',
      'EVENT_MANAGE',
      'SCHEDULE_READ',
      'SCHEDULE_MANAGE',
      'ATTENDANCE_READ',
      'ATTENDANCE_MANAGE',
      'NOTIFICATION_READ',
      'NOTIFICATION_SEND',
    ]);
    leaderUserId = leader.id;
    leaderToken = leader.token;
    normalToken = (await user([])).token;
    leaderId = (
      await db.member.create({
        data: {
          name: 'Leader Person',
          email: 'private@operations.example',
          phone: '12345',
          notes: 'PRIVATE ADMIN NOTES',
        },
      })
    ).id;
    otherId = (await db.member.create({ data: { name: 'Other Person' } })).id;
    thirdId = (await db.member.create({ data: { name: 'Third Person' } })).id;
    await db.user.update({
      where: { id: leaderUserId },
      data: { memberId: leaderId },
    });
  }, 60000);
  afterAll(async () => {
    if (app) await app.close();
    if (db) {
      await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await db.$disconnect();
    }
  });
  async function visitor(name = 'Visitor') {
    return (
      await post('/visitors', {
        firstName: name,
        lastName: randomUUID().slice(0, 8),
        firstVisitDate: '2026-10-01',
      }).expect(201)
    ).body as { id: string };
  }
  async function group(capacity = 10, leaderMemberId = leaderId) {
    return (
      await post('/small-groups', {
        name: randomUUID(),
        leaderMemberId,
        address: 'Community',
        meetingDay: 2,
        meetingTime: '20:00',
        capacity,
      }).expect(201)
    ).body as { id: string };
  }
  async function event(
    start = '2026-12-10T19:00:00Z',
    end = '2026-12-10T21:00:00Z',
    capacity = 10,
  ) {
    return (
      await post('/events', {
        title: randomUUID(),
        type: 'SERVICE',
        location: 'Church',
        startDateTime: start,
        endDateTime: end,
        capacity,
      }).expect(201)
    ).body as { id: string };
  }
  it('converts without destroying visitor history, prevents duplicate people and audits the actor', async () => {
    const v = await visitor('Conversion');
    const result = await post('/visitors/' + v.id + '/convert', {}).expect(201);
    const saved = await db.visitor.findUniqueOrThrow({ where: { id: v.id } });
    expect(saved.memberId).toBe(result.body.memberId);
    expect(saved.convertedByUserId).toBe(actorId);
    expect(saved.status).toBe('INTEGRATED');
    expect(
      (await post('/visitors/' + v.id + '/convert', {}).expect(201)).body
        .alreadyConverted,
    ).toBe(true);
    const existing = await db.member.create({
      data: { name: 'Existing Person', email: 'duplicate@operations.example' },
    });
    const duplicate = (
      await post('/visitors', {
        firstName: 'Existing',
        lastName: 'Person',
        email: 'duplicate@operations.example',
        firstVisitDate: '2026-10-01',
      })
    ).body as { id: string };
    await post('/visitors/' + duplicate.id + '/convert', {}).expect(409);
    await post('/visitors/' + duplicate.id + '/convert', {
      memberId: existing.id,
    }).expect(201);
    expect(
      await db.member.count({
        where: { email: 'duplicate@operations.example' },
      }),
    ).toBe(1);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'VISITOR_CONVERT', entityId: v.id },
    });
    expect(audit.userId).toBe(actorId);
    expect(audit.ip).not.toBeNull();
    await post('/visitors/' + v.id + '/convert', {}, leaderToken).expect(403);
  });
  it('records chronological follow-up interactions and restricts assignees', async () => {
    const v = await visitor('Followup');
    const f = (
      await post('/follow-ups', {
        visitorId: v.id,
        assignedToUserId: leaderUserId,
        nextContactAt: '2026-01-01T10:00:00Z',
      }).expect(201)
    ).body as { id: string };
    await post(
      '/follow-ups/' + f.id + '/interactions',
      {
        type: 'PHONE',
        interactionDate: '2026-10-03T10:00:00Z',
        notes: 'Later',
      },
      leaderToken,
    ).expect(201);
    await post(
      '/follow-ups/' + f.id + '/interactions',
      {
        type: 'IN_PERSON',
        interactionDate: '2026-10-02T10:00:00Z',
        notes: 'Earlier',
      },
      leaderToken,
    ).expect(201);
    const timeline = await get(
      '/follow-ups/' + f.id + '/interactions',
      leaderToken,
    ).expect(200);
    expect(timeline.body.items.map((i: { notes: string }) => i.notes)).toEqual([
      'Earlier',
      'Later',
    ]);
    await patch(
      '/follow-ups/' + f.id,
      { assignedToUserId: actorId },
      leaderToken,
    ).expect(403);
    await patch('/follow-ups/' + f.id, { assignedToUserId: actorId }).expect(
      200,
    );
    await get('/follow-ups/' + f.id + '/interactions', leaderToken).expect(404);
    await post('/follow-ups', {
      memberId: leaderId,
      visitorId: v.id,
      assignedToUserId: actorId,
    }).expect(400);
    const audit = await db.auditLog.findFirstOrThrow({
      where: {
        entity: 'FollowUp',
        entityId: f.id,
        action: 'DATA_FollowUp_UPDATE',
      },
    });
    expect(audit.userId).toBeTruthy();
  });
  it('preserves group participation on departure and enforces capacity and leader scope', async () => {
    const g = await group(1);
    const joined = (
      await post(
        '/small-groups/' + g.id + '/participants',
        { memberId: otherId },
        leaderToken,
      ).expect(201)
    ).body as { id: string };
    await post(
      '/small-groups/' + g.id + '/participants',
      { memberId: thirdId },
      leaderToken,
    ).expect(409);
    await post(
      '/small-groups/' + g.id + '/participants/' + joined.id + '/leave',
      {},
      leaderToken,
    ).expect(201);
    await post(
      '/small-groups/' + g.id + '/participants',
      { memberId: otherId },
      leaderToken,
    ).expect(201);
    expect(
      (await get('/small-groups/' + g.id + '/participants', leaderToken)).body
        .total,
    ).toBe(2);
    const otherGroup = await group(10, otherId);
    await get(
      '/small-groups/' + otherGroup.id + '/participants',
      leaderToken,
    ).expect(404);
    await patch(
      '/small-groups/' + g.id,
      { leaderMemberId: otherId },
      leaderToken,
    ).expect(403);
  });
  it('allows several ministries and records departure without deletion', async () => {
    const ids: string[] = [];
    for (let n = 0; n < 2; n++) {
      const m = (
        await post('/ministries', {
          name: 'Ministry ' + randomUUID(),
          leaderMemberId: leaderId,
        }).expect(201)
      ).body as { id: string };
      ids.push(m.id);
      const joined = (
        await post(
          '/ministries/' + m.id + '/participants',
          { memberId: otherId },
          leaderToken,
        ).expect(201)
      ).body as { id: string };
      await post(
        '/ministries/' + m.id + '/participants',
        { memberId: otherId },
        leaderToken,
      ).expect(409);
      if (n === 0)
        await post(
          '/ministries/' + m.id + '/participants/' + joined.id + '/leave',
          {},
          leaderToken,
        ).expect(201);
    }
    expect(
      await db.ministryMember.count({
        where: { memberId: otherId, ministryId: { in: ids } },
      }),
    ).toBe(2);
  });
  it('enforces registration capacity under concurrent requests and validates event dates', async () => {
    const e = await event(undefined, undefined, 1);
    const responses = await Promise.all([
      post('/events/' + e.id + '/registrations', { memberId: otherId }),
      post('/events/' + e.id + '/registrations', { memberId: thirdId }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const reg = await db.eventRegistration.findFirstOrThrow({
      where: { eventId: e.id },
    });
    await post(
      '/events/' + e.id + '/registrations/' + reg.id + '/cancel',
      {},
    ).expect(201);
    await post('/events/' + e.id + '/registrations', {
      memberId: reg.memberId!,
    }).expect(201);
    await patch('/events/' + e.id, { capacity: 0 }).expect(400);
    await patch('/events/' + e.id, {
      endDateTime: '2026-12-10T18:00:00Z',
    }).expect(400);
    await patch('/events/' + e.id, { status: 'CANCELLED' }).expect(200);
    await post('/events/' + e.id + '/registrations', {
      memberId: thirdId,
    }).expect(409);
  });
  it('blocks overlapping assignments and preserves replacement chain', async () => {
    const first = await event('2026-12-12T19:00:00Z', '2026-12-12T21:00:00Z');
    const second = await event('2026-12-12T20:00:00Z', '2026-12-12T22:00:00Z');
    const makeSchedule = async (eventId: string) =>
      (
        await post('/schedules', {
          eventId,
          title: 'Volunteers',
          date: '2026-12-12T19:00:00Z',
        }).expect(201)
      ).body as { id: string };
    const s1 = await makeSchedule(first.id),
      s2 = await makeSchedule(second.id);
    const assignment = (
      await post('/schedules/' + s1.id + '/assignments', {
        memberId: otherId,
        function: 'Reception',
      }).expect(201)
    ).body as { id: string };
    await post('/schedules/' + s2.id + '/assignments', {
      memberId: otherId,
      function: 'Music',
    }).expect(409);
    const replacement = (
      await post(
        '/schedules/' + s1.id + '/assignments/' + assignment.id + '/replace',
        { memberId: thirdId, function: 'Reception' },
      ).expect(201)
    ).body as { id: string };
    const old = await db.volunteerAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
    });
    expect(old.status).toBe('REPLACED');
    expect(old.replacedByAssignmentId).toBe(replacement.id);
    await patch('/schedules/' + s1.id + '/assignments/' + replacement.id, {
      status: 'CONFIRMED',
    }).expect(200);
    await patch('/schedules/' + s1.id + '/assignments/' + assignment.id, {
      status: 'CONFIRMED',
    }).expect(409);
  });
  it('rejects changes that introduce conflicts and permits only the assigned volunteer to respond', async () => {
    const first = await event('2026-12-20T19:00:00Z', '2026-12-20T20:00:00Z');
    const second = await event('2026-12-20T21:00:00Z', '2026-12-20T22:00:00Z');
    const schedules: string[] = [];
    for (const e of [first, second]) {
      const row = (
        await post('/schedules', {
          eventId: e.id,
          title: 'No overlap',
          date: '2026-12-20T19:00:00Z',
        }).expect(201)
      ).body as { id: string };
      schedules.push(row.id);
      await post('/schedules/' + row.id + '/assignments', {
        memberId: leaderId,
        function: 'Welcome',
      }).expect(201);
    }
    await patch('/events/' + second.id, {
      startDateTime: '2026-12-20T19:30:00Z',
    }).expect(409);
    expect(
      (
        await db.communityEvent.findUniqueOrThrow({ where: { id: second.id } })
      ).startsAt.toISOString(),
    ).toBe('2026-12-20T21:00:00.000Z');
    const assignment = await db.volunteerAssignment.findFirstOrThrow({
      where: { scheduleId: schedules[0] },
    });
    await post(
      '/schedules/' +
        schedules[0] +
        '/assignments/' +
        assignment.id +
        '/respond',
      { status: 'CONFIRMED' },
      leaderToken,
    ).expect(201);
    await post(
      '/schedules/' +
        schedules[0] +
        '/assignments/' +
        assignment.id +
        '/respond',
      { status: 'COMPLETED' },
      leaderToken,
    ).expect(400);
    await post(
      '/schedules/' +
        schedules[0] +
        '/assignments/' +
        assignment.id +
        '/respond',
      { status: 'DECLINED' },
      token,
    ).expect(404);
    expect((await get('/dashboard', leaderToken)).body.scheduleConflicts).toBe(
      0,
    );
  });
  it('scopes newly registered visitors to their creator and rejects malformed optional values', async () => {
    const v = (
      await post(
        '/visitors',
        { firstName: 'My', lastName: 'Visitor', firstVisitDate: '2026-10-01' },
        leaderToken,
      ).expect(201)
    ).body as { id: string };
    expect(
      (await get('/visitors', leaderToken)).body.items.some(
        (r: { id: string }) => r.id === v.id,
      ),
    ).toBe(true);
    await patch(
      '/visitors/' + v.id,
      { email: null, notes: null },
      leaderToken,
    ).expect(200);
    await patch('/visitors/' + v.id, { firstName: null }, leaderToken).expect(
      400,
    );
    const single = (
      await post(
        '/visitors',
        { firstName: 'Single', firstVisitDate: '2026-10-01' },
        leaderToken,
      ).expect(201)
    ).body as { id: string };
    await patch(
      '/visitors/' + single.id,
      { status: 'ARCHIVED' },
      leaderToken,
    ).expect(200);
    const veryLongName = 'V'.repeat(120);
    const legacy = (
      await call('post', '/community/visitors', {
        name: veryLongName,
        visitedAt: '2026-10-01',
      }).expect(201)
    ).body as { id: string; name: string };
    expect(legacy.name).toBe(veryLongName);
    expect(
      (
        await call('patch', '/community/visitors/' + legacy.id, {
          notes: 'Update',
        }).expect(200)
      ).body.name,
    ).toBe(veryLongName);
  });
  it('avoids duplicate attendance, supports corrections and period totals', async () => {
    const e = await event('2026-11-10T19:00:00Z', '2026-11-10T21:00:00Z');
    const body = {
      memberId: leaderId,
      eventId: e.id,
      attendanceDate: '2026-11-10',
      status: 'PRESENT',
    };
    const a = (await post('/attendance', body).expect(201)).body as {
      id: string;
    };
    await post('/attendance', body).expect(409);
    await post('/attendance', {
      ...body,
      visitorId: (await visitor()).id,
    }).expect(400);
    await patch('/attendance/' + a.id, { status: 'EXCUSED' }).expect(200);
    const report = await get(
      '/attendance?memberId=' + leaderId + '&start=2026-11-01&end=2026-11-30',
    ).expect(200);
    expect(report.body.total).toBe(1);
    expect(report.body.summary[0].status).toBe('EXCUSED');
    const guest = await visitor('Attendance conversion');
    await post('/attendance', {
      visitorId: guest.id,
      eventId: e.id,
      attendanceDate: '2026-11-10',
      status: 'PRESENT',
    }).expect(201);
    await post('/events/' + e.id + '/registrations', {
      visitorId: guest.id,
    }).expect(201);
    const converted = await post(
      '/visitors/' + guest.id + '/convert',
      {},
    ).expect(201);
    await post('/attendance', {
      memberId: converted.body.memberId,
      eventId: e.id,
      attendanceDate: '2026-11-10',
      status: 'PRESENT',
    }).expect(409);
    await post('/events/' + e.id + '/registrations', {
      memberId: converted.body.memberId,
    }).expect(409);
    expect(
      (await get('/attendance?memberId=' + converted.body.memberId)).body.total,
    ).toBe(1);
    expect(
      (await db.attendance.findUniqueOrThrow({ where: { id: a.id } }))
        .registeredByUserId,
    ).toBe(actorId);
  });
  it('applies RBAC and returns minimal member data without financial or administrative fields', async () => {
    await get('/small-groups', normalToken).expect(403);
    await get('/dashboard', normalToken).expect(403);
    await call('get', '/finance/contributions', undefined, leaderToken).expect(
      403,
    );
    await call('get', '/members/' + leaderId, undefined, leaderToken).expect(
      403,
    );
    const people = await get('/people', leaderToken).expect(200);
    const leader = people.body.items.find(
      (m: { id: string }) => m.id === leaderId,
    ) as object;
    expect(Object.keys(leader).sort()).toEqual(['id', 'name', 'status']);
    const privateVisitor = await visitor('Private');
    expect(
      (await get('/visitors', leaderToken)).body.items.some(
        (v: { id: string }) => v.id === privateVisitor.id,
      ),
    ).toBe(false);
    const legacy = await call(
      'get',
      '/community/visitors',
      undefined,
      leaderToken,
    ).expect(200);
    expect(
      legacy.body.items.some((v: { id: string }) => v.id === privateVisitor.id),
    ).toBe(false);
    const dashboard = await get('/dashboard', leaderToken).expect(200);
    expect(JSON.stringify(dashboard.body)).not.toMatch(
      /amount|contribution|income|passwordHash|PRIVATE ADMIN NOTES/,
    );
  });
  it('keeps unsupported notification channels pending and delivers internal messages only once', async () => {
    const n = (
      await post('/notifications', {
        recipientMemberId: leaderId,
        channel: 'EMAIL',
        content: 'Hello',
      }).expect(201)
    ).body as { id: string };
    await post('/notifications/' + n.id + '/send', {}).expect(409);
    expect(
      (await db.notification.findUniqueOrThrow({ where: { id: n.id } })).status,
    ).toBe('PENDING');
    await post('/notifications/' + n.id + '/cancel', {}).expect(201);
    const internal = (
      await post('/notifications', {
        recipientMemberId: leaderId,
        channel: 'INTERNAL',
        content: 'Internal',
      })
    ).body as { id: string };
    await post('/notifications/' + internal.id + '/send', {}).expect(201);
    await post('/notifications/' + internal.id + '/send', {}).expect(409);
    await db.notification.create({
      data: {
        recipientMemberId: otherId,
        channel: 'INTERNAL',
        status: 'SENT',
        content: 'Another member private message',
        sentAt: new Date(),
        createdByUserId: actorId,
      },
    });
    const inbox = await get('/inbox', leaderToken).expect(200);
    expect(inbox.body.total).toBe(1);
    expect(inbox.body.items[0].id).toBe(internal.id);
    expect(JSON.stringify(inbox.body)).not.toContain(
      'Another member private message',
    );
    expect((await get('/inbox', normalToken)).body.total).toBe(0);
    const failing = (
      await post('/notifications', {
        recipientMemberId: leaderId,
        channel: 'SMS',
        content: 'Test failure',
      })
    ).body as { id: string };
    const failed = await post(
      '/notifications/' + failing.id + '/send',
      {},
    ).expect(201);
    expect(failed.body.status).toBe('FAILED');
    expect(failed.body.error).not.toContain('Sensitive provider credential');
    await get('/notifications', normalToken).expect(403);
  });
});
