import type { CurrentUser } from '@church/shared';
import { Prisma } from '@prisma/client';
import { OperationsContext } from './operations-context';
export class ScheduleConflictsService {
  constructor(private readonly context: OperationsContext) {}

  async assignmentConflicts(
    tx: Prisma.TransactionClient,
    memberId: string,
    scheduleId: string,
  ) {
    const schedule = await tx.volunteerSchedule.findUniqueOrThrow({
      where: { id: scheduleId },
      include: { event: true },
    });
    const start = schedule.event?.startsAt ?? schedule.date;
    const end = schedule.event?.endsAt ?? new Date(start.getTime() + 3600000);
    const rows = await tx.volunteerAssignment.findMany({
      where: {
        memberId,
        scheduleId: { not: scheduleId },
        status: { in: ['INVITED', 'CONFIRMED'] },
        schedule: { status: { in: ['DRAFT', 'PUBLISHED'] } },
      },
      include: { schedule: { include: { event: true } } },
    });
    return rows.filter((row) => {
      if (row.schedule.event?.status === 'CANCELLED') return false;
      const otherStart = row.schedule.event?.startsAt ?? row.schedule.date;
      const otherEnd =
        row.schedule.event?.endsAt ?? new Date(otherStart.getTime() + 3600000);
      return otherStart < end && start < otherEnd;
    });
  }
  async conflictCount(
    tx: Prisma.TransactionClient,
    user?: CurrentUser,
    eventId?: string,
    scheduleId?: string,
  ) {
    const own = user ? await this.context.memberId(user) : null;
    const scope =
      user && !this.context.all(user)
        ? Prisma.sql`AND EXISTS (SELECT 1 FROM ministries visible_a WHERE visible_a.id=sa."ministryId" AND (visible_a."leaderMemberId"=${own}::uuid OR EXISTS (SELECT 1 FROM ministry_members membership_a WHERE membership_a."ministryId"=visible_a.id AND membership_a."memberId"=${own}::uuid AND membership_a.active=true AND membership_a."leftAt" IS NULL)))
          AND EXISTS (SELECT 1 FROM ministries visible_b WHERE visible_b.id=sb."ministryId" AND (visible_b."leaderMemberId"=${own}::uuid OR EXISTS (SELECT 1 FROM ministry_members membership_b WHERE membership_b."ministryId"=visible_b.id AND membership_b."memberId"=${own}::uuid AND membership_b.active=true AND membership_b."leftAt" IS NULL)))`
        : Prisma.empty;
    const [row] = await tx.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) FROM volunteer_assignments a JOIN volunteer_assignments b ON a."memberId"=b."memberId" AND a.id<b.id AND a."scheduleId"<>b."scheduleId"
      JOIN volunteer_schedules sa ON sa.id=a."scheduleId" JOIN volunteer_schedules sb ON sb.id=b."scheduleId"
      LEFT JOIN community_events ea ON ea.id=sa."eventId" LEFT JOIN community_events eb ON eb.id=sb."eventId"
      WHERE a.status IN ('INVITED','CONFIRMED') AND b.status IN ('INVITED','CONFIRMED') AND sa.status IN ('DRAFT','PUBLISHED') AND sb.status IN ('DRAFT','PUBLISHED') AND COALESCE(ea.status,'SCHEDULED')<>'CANCELLED' AND COALESCE(eb.status,'SCHEDULED')<>'CANCELLED'
      AND COALESCE(ea."startsAt",sa.date)<COALESCE(eb."endsAt",eb."startsAt"+interval '1 hour',sb.date+interval '1 hour') AND COALESCE(eb."startsAt",sb.date)<COALESCE(ea."endsAt",ea."startsAt"+interval '1 hour',sa.date+interval '1 hour')
      ${eventId ? Prisma.sql`AND (ea.id=${eventId}::uuid OR eb.id=${eventId}::uuid)` : Prisma.empty}
      ${scheduleId ? Prisma.sql`AND (sa.id=${scheduleId}::uuid OR sb.id=${scheduleId}::uuid)` : Prisma.empty} ${scope}`;
    return Number(row?.count ?? 0);
  }
}
