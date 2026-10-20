import type { CurrentUser } from '@church/shared';
import { PrismaService } from '../../database/prisma.service';
import { OperationsService } from './operations.service';
import { OperationQuery } from './operations.dto';

const user = (permissions: CurrentUser['permissions']): CurrentUser => ({
  id: 'reader',
  name: 'Reader',
  email: 'reader@example.org',
  status: 'ACTIVE',
  permissions,
});

describe('Operational dashboard aggregate permissions', () => {
  it('does not read any domain without a corresponding permission', async () => {
    const service = new OperationsService({} as PrismaService, []);
    await expect(
      service.dashboard(new OperationQuery(), user([])),
    ).resolves.toEqual({});
  });

  it('does not expose group membership or volunteer aggregates to a member-only reader', async () => {
    const db = { member: { count: jest.fn().mockResolvedValue(329) } };
    const service = new OperationsService(db as unknown as PrismaService, []);
    await expect(
      service.dashboard(new OperationQuery(), user(['MEMBER_READ'])),
    ).resolves.toEqual({ activeMembers: 329 });
    expect(db.member.count).toHaveBeenCalledTimes(1);
  });

  it('does not disclose follow-up aggregates to a visitor reader without follow-up permission', async () => {
    const db = { visitor: { count: jest.fn().mockResolvedValue(2) } };
    const service = new OperationsService(db as unknown as PrismaService, []);
    const result = await service.dashboard(
      new OperationQuery(),
      user(['VISITOR_READ', 'OPERATION_SCOPE_ALL']),
    );
    expect(result.visitors).toBe(2);
    expect(result).not.toHaveProperty('followedVisitors');
    expect(result).not.toHaveProperty('activeMembers');
    expect(result).not.toHaveProperty('activeMembersWithoutGroup');
    expect(result).not.toHaveProperty('activeVolunteers');
  });
});
