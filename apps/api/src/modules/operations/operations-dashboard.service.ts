import type { CurrentUser } from '@church/shared';
import * as D from './operations.dto';
import { OperationsContext } from './operations-context';
import { ScheduleConflictsService } from './schedule-conflicts.service';
import { followInclude, scheduleInclude } from './operations.projections';
export class OperationsDashboardService {
  constructor(
    private readonly context: OperationsContext,
    private readonly conflictsService: ScheduleConflictsService,
  ) {}
  private get db() {
    return this.context.db;
  }

  async dashboard(q: D.OperationQuery, user: CurrentUser) {
    const p = user.permissions,
      result: Record<string, unknown> = {};
    const now = new Date();
    if (p.includes('MEMBER_READ')) {
      result.activeMembers = await this.db.member.count({
        where: { status: 'ACTIVE' },
      });
      if (p.includes('SMALL_GROUP_READ'))
        result.activeMembersWithoutGroup = await this.db.member.count({
          where: {
            status: 'ACTIVE',
            groupMemberships: {
              none: {
                active: true,
                leftAt: null,
                smallGroup: { active: true },
              },
            },
          },
        });
    }
    if (p.includes('VISITOR_READ')) {
      const scope = await this.context.visitorScope(user),
        where = { AND: [scope, { visitedAt: this.context.range(q) }] };
      result.visitors = await this.db.visitor.count({ where });
      if (p.includes('FOLLOWUP_READ'))
        result.followedVisitors = await this.db.visitor.count({
          where: {
            AND: [
              where,
              {
                followUps: {
                  some: {
                    ...(this.context.all(user)
                      ? {}
                      : { assignedToUserId: user.id }),
                    status: { in: ['IN_PROGRESS', 'WAITING', 'COMPLETED'] },
                  },
                },
              },
            ],
          },
        });
      result.newVisitors = await this.db.visitor.count({
        where: { AND: [where, { status: 'NEW' }] },
      });
      result.integrating = await this.db.visitor.count({
        where: { AND: [where, { status: 'INTEGRATING' }] },
      });
    }
    if (p.includes('FOLLOWUP_READ')) {
      const scope = this.context.all(user) ? {} : { assignedToUserId: user.id };
      const where = {
        ...scope,
        status: { in: ['PENDING', 'IN_PROGRESS', 'WAITING'] },
      };
      result.pendingFollowUps = await this.db.followUp.count({
        where: { ...where, status: 'PENDING' },
      });
      result.activeFollowUps = await this.db.followUp.count({
        where: { ...where, status: 'IN_PROGRESS' },
      });
      result.overdueContacts = await this.db.followUp.count({
        where: { ...where, nextContactAt: { lt: now } },
      });
      result.completedFollowUps = await this.db.followUp.count({
        where: {
          ...scope,
          status: 'COMPLETED',
          completedAt: this.context.range(q),
        },
      });
      result.nextContacts = await this.db.followUp.findMany({
        where,
        include: followInclude,
        orderBy: [{ nextContactAt: 'asc' }, { id: 'asc' }],
        take: 5,
      });
    }
    if (p.includes('SMALL_GROUP_READ')) {
      const scope = await this.context.groupScope(user);
      result.activeGroups = await this.db.smallGroup.count({
        where: { AND: [scope, { active: true }] },
      });
      result.groupParticipants = await this.db.smallGroupMember.count({
        where: { active: true, smallGroup: scope },
      });
    }
    if (p.includes('MINISTRY_READ')) {
      const scope = await this.context.ministryScope(user);
      result.activeMinistries = await this.db.ministry.count({
        where: { AND: [scope, { active: true }] },
      });
      const volunteers = await this.db.ministryMember.groupBy({
        where: {
          active: true,
          leftAt: null,
          member: { status: 'ACTIVE' },
          ministry: { AND: [scope, { active: true }] },
        },
        by: ['memberId'],
      });
      result.activeVolunteers = volunteers.length;
    }
    if (p.includes('EVENT_READ'))
      result.upcomingEvents = await this.db.communityEvent.findMany({
        where: {
          AND: [
            await this.context.eventScope(user),
            { active: true, status: 'SCHEDULED', startsAt: { gte: now } },
          ],
        },
        select: { id: true, name: true, startsAt: true },
        take: 5,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      });
    if (p.includes('SCHEDULE_READ'))
      result.scheduleConflicts = await this.conflictsService.conflictCount(
        this.db,
        user,
      );
    if (p.includes('SCHEDULE_READ'))
      result.upcomingSchedules = await this.db.volunteerSchedule.findMany({
        where: {
          AND: [
            await this.context.scheduleScope(user),
            { status: { in: ['DRAFT', 'PUBLISHED'] }, date: { gte: now } },
          ],
        },
        include: scheduleInclude,
        take: 5,
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      });
    return result;
  }
}
