import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { Permission } from '../auth/permission.decorator';
import type { AuthRequest } from '../auth/auth.guard';
import { OperationsModule } from '../operations/operations.controller';
import { OperationsService } from '../operations/operations.service';
import {
  CommunityQuery,
  EventDto,
  EventPatch,
  VisitorDto,
  VisitorPatch,
} from './community.dto';
@ApiTags('Comunidade')
@ApiBearerAuth()
@Controller('community')
export class CommunityController {
  constructor(
    private readonly db: PrismaService,
    private readonly operations: OperationsService,
  ) {}
  @Get('dashboard') async dashboard(@Req() r: AuthRequest) {
    const p = r.user.permissions;
    if (
      !p.some((c) => ['MEMBER_READ', 'VISITOR_READ', 'EVENT_READ'].includes(c))
    )
      throw new ForbiddenException();
    return this.db.$transaction(
      async (tx) => ({
        ...(p.includes('MEMBER_READ')
          ? {
              members: await tx.member.groupBy({
                by: ['status'],
                _count: { _all: true },
              }),
            }
          : {}),
        ...(p.includes('VISITOR_READ')
          ? {
              visitors: await tx.visitor.groupBy({
                by: ['status'],
                where: await this.operations.visitorScope(r.user),
                _count: { _all: true },
              }),
            }
          : {}),
        ...(p.includes('EVENT_READ')
          ? {
              events: await tx.communityEvent.count({
                where: {
                  AND: [
                    await this.operations.eventScope(r.user),
                    { status: 'SCHEDULED', startsAt: { gte: new Date() } },
                  ],
                },
              }),
              upcomingEvents: await tx.communityEvent.findMany({
                where: {
                  AND: [
                    await this.operations.eventScope(r.user),
                    { status: 'SCHEDULED', startsAt: { gte: new Date() } },
                  ],
                },
                orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
                take: 5,
              }),
            }
          : {}),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  @Get('visitors') @Permission('VISITOR_READ') visitors(
    @Query() q: CommunityQuery,
    @Req() r: AuthRequest,
  ) {
    return this.operations.visitors(q, r.user);
  }
  @Post('visitors') @Permission('VISITOR_WRITE') visitor(
    @Body() dto: VisitorDto,
    @Req() r: AuthRequest,
  ) {
    const [firstName, ...last] = dto.name.trim().split(/\s+/);
    return this.operations.saveVisitor(
      undefined,
      {
        ...dto,
        firstName: firstName!.slice(0, 60),
        lastName: last.join(' ').slice(0, 59),
        firstVisitDate: dto.visitedAt,
        email: dto.email,
        phone: dto.phone,
        notes: dto.notes,
      },
      r.user,
    );
  }
  @Patch('visitors/:id') @Permission('VISITOR_WRITE') async updateVisitor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VisitorPatch,
    @Req() r: AuthRequest,
  ) {
    const [firstName, ...last] = dto.name?.trim().split(/\s+/) ?? [];
    return this.operations.saveVisitor(
      id,
      {
        ...dto,
        firstName: firstName?.slice(0, 60),
        lastName: dto.name ? last.join(' ').slice(0, 59) : undefined,
        firstVisitDate: dto.visitedAt,
        email: dto.email,
        phone: dto.phone,
        notes: dto.notes,
      },
      r.user,
    );
  }
  @Get('events') @Permission('EVENT_READ') events(
    @Query() q: CommunityQuery,
    @Req() r: AuthRequest,
  ) {
    return this.operations.events(q, r.user);
  }
  @Post('events') @Permission('EVENT_WRITE') event(
    @Body() dto: EventDto,
    @Req() r: AuthRequest,
  ) {
    return this.operations.saveEvent(
      undefined,
      {
        ...dto,
        title: dto.name,
        type: 'OTHER',
        startDateTime: dto.startsAt,
        endDateTime: new Date(
          new Date(dto.startsAt).getTime() + 3600000,
        ).toISOString(),
        description: dto.description ?? undefined,
      },
      r.user,
    );
  }
  @Patch('events/:id') @Permission('EVENT_WRITE') async updateEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EventPatch,
    @Req() r: AuthRequest,
  ) {
    return this.operations.saveEvent(
      id,
      {
        ...dto,
        title: dto.name,
        startDateTime: dto.startsAt,
        endDateTime: dto.startsAt
          ? new Date(new Date(dto.startsAt).getTime() + 3600000).toISOString()
          : undefined,
        description: dto.description ?? undefined,
      },
      r.user,
    );
  }
}
@Module({ imports: [OperationsModule], controllers: [CommunityController] })
export class CommunityModule {}
