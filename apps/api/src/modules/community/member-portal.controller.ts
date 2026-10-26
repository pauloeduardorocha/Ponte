import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  NotFoundException,
  Module,
} from '@nestjs/common';

import { IsUUID } from 'class-validator';

import { PrismaService } from '../../database/prisma.service';

import { AuthRequest } from '../auth/auth.guard';

import { Permission } from '../auth/permission.decorator';

import { PageQuery } from '../members/member.dto';

import { LibraryModule } from '../library/library.module';

import { LibraryService } from '../library/library.service';

class ReserveBookDto {
  @IsUUID() bookId!: string;
}

const person = { select: { id: true, name: true } } as const;

@Controller('member-portal')
@Permission('COMMUNITY_READ')
export class MemberPortalController {
  constructor(
    private readonly db: PrismaService,
    private readonly library: LibraryService,
  ) {}

  private async identity(userId: string) {
    const account = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        member: { select: { id: true, status: true, anonymizedAt: true } },
      },
    });

    if (
      !account?.member ||
      account.member.status !== 'ACTIVE' ||
      account.member.anonymizedAt
    )
      throw new NotFoundException('Membro ativo não encontrado');

    return account.member.id;
  }

  @Get('dashboard') async dashboard(@Req() r: AuthRequest) {
    const memberId = await this.identity(r.user.id);
    const now = new Date();
    const membership = { some: { memberId, active: true, leftAt: null } };
    const [
      upcomingSchedules,
      groups,
      reimbursements,
      upcomingEvents,
      reservations,
      loans,
      fines,
    ] = await Promise.all([
      this.db.volunteerSchedule.findMany({
        where: {
          status: 'PUBLISHED',
          date: { gte: now },
          ministry: {
            active: true,
            OR: [{ leaderMemberId: memberId }, { members: membership }],
          },
          AND: [
            {
              OR: [
                { eventId: null },
                { event: { active: true, status: { not: 'CANCELLED' } } },
              ],
            },
          ],
        },
        select: {
          id: true,
          title: true,
          date: true,
          ministry: { select: { name: true } },
        },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        take: 5,
      }),
      this.db.smallGroup.findMany({
        where: {
          active: true,
          OR: [
            { leaderMemberId: memberId },
            { coLeaderMemberId: memberId },
            { hostMemberId: memberId },
            { members: membership },
          ],
        },
        select: {
          id: true,
          name: true,
          address: true,
          meetingDay: true,
          meetingTime: true,
          leader: person,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.db.reimbursement.findMany({
        where: {
          submittedBy: r.user.id,
          deletedAt: null,
          paidAt: null,
          bankTransactionId: null,
        },
        select: { id: true, purpose: true, amount: true, currency: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.db.communityEvent.findMany({
        where: {
          active: true,
          publishedAt: { not: null },
          status: 'SCHEDULED',
          startsAt: { gte: now },
        },
        select: { id: true, name: true, startsAt: true, location: true },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 5,
      }),
      this.db.reservation.findMany({
        where: {
          memberId,
          status: { in: ['WAITING', 'READY'] },
          expiresAt: { gt: now },
        },
        select: {
          id: true,
          status: true,
          expiresAt: true,
          book: { select: { title: true } },
        },
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      }),
      this.db.loan.findMany({
        where: { memberId, status: { in: ['ACTIVE', 'OVERDUE', 'LOST'] } },
        select: {
          id: true,
          status: true,
          dueAt: true,
          bookCopy: { select: { book: { select: { title: true } } } },
        },
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      }),
      this.db.fine.findMany({
        where: { loan: { memberId }, status: 'OPEN' },
        select: {
          id: true,
          amount: true,
          paidAmount: true,
          discount: true,
          loan: {
            select: {
              bookCopy: { select: { book: { select: { title: true } } } },
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return {
      upcomingSchedules,
      groups,
      reimbursements,
      upcomingEvents,
      reservations,
      loans,
      fines,
    };
  }

  @Get('events') async events(@Query() q: PageQuery) {
    const where = {
      active: true,
      publishedAt: { not: null },
      status: 'SCHEDULED',
      name: { contains: q.search, mode: 'insensitive' as const },
    };

    const [items, total] = await this.db.$transaction([
      this.db.communityEvent.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          startsAt: true,
          endsAt: true,
          location: true,
          isPaid: true,
          registrationRequired: true,
        },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),

      this.db.communityEvent.count({ where }),
    ]);

    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  @Get('small-groups') async groups(
    @Query() q: PageQuery,
    @Req() r: AuthRequest,
  ) {
    const memberId = await this.identity(r.user.id);

    const where = {
      active: true,
      name: { contains: q.search, mode: 'insensitive' as const },
    };

    const [items, total] = await this.db.$transaction([
      this.db.smallGroup.findMany({
        where,
        select: {
          id: true,
          name: true,
          leaderMemberId: true,
          coLeaderMemberId: true,
          hostMemberId: true,
          leader: person,
          members: {
            where: { active: true, leftAt: null },
            select: { member: person },
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),

      this.db.smallGroup.count({ where }),
    ]);

    return {
      items: items.map(
        ({ leaderMemberId, coLeaderMemberId, hostMemberId, ...group }) => ({
          ...group,
          canViewDetails: [
            leaderMemberId,
            coLeaderMemberId,
            hostMemberId,
            ...group.members.map((m) => m.member.id),
          ].includes(memberId),
        }),
      ),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  @Get('small-groups/:id') async group(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() r: AuthRequest,
  ) {
    const memberId = await this.identity(r.user.id);

    const group = await this.db.smallGroup.findFirst({
      where: {
        id,
        active: true,
        OR: [
          { leaderMemberId: memberId },
          { coLeaderMemberId: memberId },
          { hostMemberId: memberId },
          { members: { some: { memberId, active: true, leftAt: null } } },
        ],
      },
      select: {
        id: true,
        name: true,
        description: true,
        address: true,
        meetingDay: true,
        meetingTime: true,
        leader: person,
        coLeader: person,
        host: person,
        members: {
          where: { active: true, leftAt: null },
          select: { member: person },
        },
      },
    });

    if (!group) throw new NotFoundException();

    return group;
  }

  @Get('ministries') async ministries(@Query() q: PageQuery) {
    const where = {
      active: true,
      name: { contains: q.search, mode: 'insensitive' as const },
    };

    const [items, total] = await this.db.$transaction([
      this.db.ministry.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          leader: person,
          members: {
            where: { active: true, leftAt: null },
            select: { member: person },
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),

      this.db.ministry.count({ where }),
    ]);

    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  @Post('reservations')
  @Permission('LIBRARY_SELF_RESERVE')
  async reserve(@Body() dto: ReserveBookDto, @Req() r: AuthRequest) {
    const memberId = await this.identity(r.user.id);

    const reservation = await this.library.reserve(
      { bookId: dto.bookId, memberId },
      r.user.id,
    );

    return {
      id: reservation.id,
      bookId: reservation.bookId,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
    };
  }
}

@Module({ imports: [LibraryModule], controllers: [MemberPortalController] })
export class MemberPortalModule {}
