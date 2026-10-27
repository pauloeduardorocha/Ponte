import { NotFoundException } from '@nestjs/common';
import { MEMBER_PERMISSIONS } from '@church/shared';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../finance/storage.service';
import { FinanceService } from '../finance/finance.service';
import { safeUser } from '../auth/auth.service';
import { AuthRequest } from '../auth/auth.guard';
import { MemberPortalController } from './member-portal.controller';
import { LibraryService } from '../library/library.service';

describe('Member access without roles', () => {
  const user = {
    id: 'account',
    name: 'Member',
    email: 'member@example.pt',
    status: 'ACTIVE' as const,
    permissions: [...MEMBER_PERMISSIONS],
  };
  it('grants basic access without any administrative role', () => {
    const identity = {
      ...user,
      memberId: 'member',
      userRoles: [],
    } as unknown as Parameters<typeof safeUser>[0];
    expect(safeUser(identity).permissions.sort()).toEqual(
      [...MEMBER_PERMISSIONS].sort(),
    );
    expect(safeUser(identity).memberId).toBe('member');
  });
  it('returns only aggregate financial numbers and never reads movements', async () => {
    const raw = jest
      .fn()
      .mockResolvedValueOnce([
        {
          currency: 'EUR',
          income: '200',
          expenses: '50',
          balance: '150',
          tithes: '80',
          offerings: '20',
        },
      ])
      .mockResolvedValueOnce([
        {
          month: '2026-01',
          currency: 'EUR',
          income: '200',
          expenses: '50',
          incomeCategories: [{ name: 'PRIVATE' }],
        },
      ]);
    const db = {
      $transaction: jest.fn(async (fn) =>
        fn({
          $queryRaw: raw,
          bankTransaction: {
            aggregate: jest.fn().mockResolvedValue({ _max: { date: null } }),
          },
        }),
      ),
    };
    const service = new FinanceService(
      db as unknown as PrismaService,
      {} as StorageService,
    );
    const result = await service.dashboard(user, { month: '2026-01' });
    expect(result).toEqual({
      month: '2026-01',
      bankDataThrough: null,
      balances: [
        { currency: 'EUR', income: '200', expenses: '50', balance: '150' },
      ],
      trend: [
        { month: '2026-01', currency: 'EUR', income: '200', expenses: '50' },
      ],
      latestTransactions: [],
    });
    await expect(
      service.dashboard(user, { accountId: 'private-account' }),
    ).rejects.toThrow();
  });
  it('requires current active group membership for private details', async () => {
    const group = jest.fn().mockResolvedValue(null);
    const db = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          member: { id: 'my-member', status: 'ACTIVE', anonymizedAt: null },
        }),
      },
      smallGroup: { findFirst: group },
    };
    const controller = new MemberPortalController(
      db as unknown as PrismaService,
      {} as LibraryService,
    );
    await expect(
      controller.group('another-group', { user } as AuthRequest),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(group.mock.calls[0][0].where.OR).toContainEqual({
      members: { some: { memberId: 'my-member', active: true, leftAt: null } },
    });
  });
  it('always reserves for the authenticated member, ignoring an injected member ID', async () => {
    const reserve = jest.fn().mockResolvedValue({
      id: 'reservation',
      bookId: 'book',
      status: 'WAITING',
    });
    const db = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          member: { id: 'my-member', status: 'ACTIVE', anonymizedAt: null },
        }),
      },
    };
    const controller = new MemberPortalController(
      db as unknown as PrismaService,
      { reserve } as unknown as LibraryService,
    );
    await controller.reserve(
      { bookId: 'book', memberId: 'victim' } as { bookId: string },
      { user } as AuthRequest,
    );
    expect(reserve).toHaveBeenCalledWith(
      { bookId: 'book', memberId: 'my-member' },
      'account',
    );
  });
});

describe('Personal dashboard privacy', () => {
  it('scopes personal records and excludes completed or unpublished entries', async () => {
    const findMany = () => jest.fn().mockResolvedValue([]);
    const db = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          member: { id: 'member', status: 'ACTIVE', anonymizedAt: null },
        }),
      },
      volunteerSchedule: { findMany: findMany() },
      smallGroup: { findMany: findMany() },
      reimbursement: { findMany: findMany() },
      communityEvent: { findMany: findMany() },
      reservation: { findMany: findMany() },
      loan: { findMany: findMany() },
      fine: { findMany: findMany() },
    };
    const controller = new MemberPortalController(
      db as unknown as PrismaService,
      {} as LibraryService,
    );
    const result = await controller.dashboard({
      user: { id: 'account' },
    } as AuthRequest);
    expect(Object.values(result).every((v) => v.length === 0)).toBe(true);
    expect(db.reimbursement.findMany.mock.calls[0][0].where).toEqual({
      submittedBy: 'account',
      deletedAt: null,
      paidAt: null,
      bankTransactionId: null,
    });
    expect(db.loan.findMany.mock.calls[0][0].where.memberId).toBe('member');
    expect(db.reservation.findMany.mock.calls[0][0].where).toMatchObject({
      memberId: 'member',
      status: { in: ['WAITING', 'READY'] },
    });
    expect(db.fine.findMany.mock.calls[0][0].where).toEqual({
      loan: { memberId: 'member' },
      status: 'OPEN',
    });
    expect(db.smallGroup.findMany.mock.calls[0][0].where.OR).toContainEqual({
      members: { some: { memberId: 'member', active: true, leftAt: null } },
    });
    expect(db.volunteerSchedule.findMany.mock.calls[0][0].where).toMatchObject({
      status: 'PUBLISHED',
      date: { gte: expect.any(Date) },
      ministry: {
        active: true,
        OR: [
          { leaderMemberId: 'member' },
          {
            members: {
              some: { memberId: 'member', active: true, leftAt: null },
            },
          },
        ],
      },
    });
    expect(
      db.volunteerSchedule.findMany.mock.calls[0][0].where,
    ).not.toHaveProperty('OR');
    expect(db.communityEvent.findMany.mock.calls[0][0].where).toMatchObject({
      publishedAt: { not: null },
      status: 'SCHEDULED',
      startsAt: { gte: expect.any(Date) },
    });
    db.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      controller.dashboard({ user: { id: 'account' } } as AuthRequest),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
