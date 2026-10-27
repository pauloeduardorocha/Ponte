import { Prisma, type NotificationDelivery } from '@prisma/client';

// HTTP contract fixtures use state storage; concurrency is verified with real PG.
export function notificationDeliveryMock() {
  const rows = new Map<string, NotificationDelivery>();
  const create = (
    data: Partial<NotificationDelivery> & { notificationId: string },
  ) => {
    const row = {
      state: 'READY',
      attempts: 0,
      uncertain: false,
      availableAt: new Date(),
      firstAttemptAt: null,
      lockedUntil: null,
      claimToken: null,
      payload: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    };
    rows.set(row.notificationId, row);
    return row;
  };
  return {
    reset: () => rows.clear(),
    createMany: jest.fn(async ({ data }) => {
      data.forEach(create);
      return { count: data.length };
    }),
    upsert: jest.fn(
      async ({ where, create: data }) =>
        rows.get(where.notificationId) ?? create(data),
    ),
    update: jest.fn(async ({ where, data }) => {
      const row = {
        ...rows.get(where.notificationId)!,
        ...data,
        ...(data.payload === Prisma.DbNull ? { payload: null } : {}),
      };
      rows.set(where.notificationId, row);
      return row;
    }),
    findUniqueOrThrow: jest.fn(async ({ where }) => {
      const row = rows.get(where.notificationId);
      if (!row) throw new Error('Missing outbox fixture');
      return row;
    }),
  };
}
