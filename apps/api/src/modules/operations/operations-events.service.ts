import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUser } from '@church/shared';
import { Prisma } from '@prisma/client';
import * as D from './operations.dto';
import { occupiedRegistrations } from '../events/registration-capacity';
import { OperationsContext } from './operations-context';
import { OperationsGroupsService } from './operations-groups.service';
import { ScheduleConflictsService } from './schedule-conflicts.service';
import { personInclude, eventInclude } from './operations.projections';
export class OperationsEventsService {
  constructor(
    private readonly context: OperationsContext,
    private readonly groupsService: OperationsGroupsService,
    private readonly conflictsService: ScheduleConflictsService,
  ) {}
  private get db() {
    return this.context.db;
  }

  async events(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.CommunityEventWhereInput = {
      AND: [
        await this.context.eventScope(user),
        {
          status: q.status,
          ministryId: q.ministryId,
          smallGroupId: q.smallGroupId,
          active: q.active ? q.active === 'true' : undefined,
          startsAt: this.context.range(q),
          name: q.search
            ? { contains: q.search, mode: 'insensitive' }
            : undefined,
        },
      ],
    };
    const [items, total] = await this.db.$transaction([
      this.db.communityEvent.findMany({
        where,
        include: eventInclude,
        ...this.context.pagination(q),
        orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.communityEvent.count({ where }),
    ]);
    return this.context.page(
      items.map((e) => ({
        ...e,
        title: e.name,
        startDateTime: e.startsAt,
        endDateTime: e.endsAt,
      })),
      total,
      q,
    );
  }
  async event(id: string, user: CurrentUser) {
    const e = await this.db.communityEvent.findFirst({
      where: { AND: [{ id }, await this.context.eventScope(user)] },
      include: eventInclude,
    });
    if (!e) throw new NotFoundException();
    return e;
  }
  async lockEvent(tx: Prisma.TransactionClient, id: string, user: CurrentUser) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    if (
      !(await tx.communityEvent.findFirst({
        where: { AND: [{ id }, await this.context.eventScope(user)] },
        select: { id: true },
      }))
    )
      throw new NotFoundException();
  }
  async saveEvent(
    id: string | undefined,
    dto: D.OperationalEventDto | D.OperationalEventPatch,
    user: CurrentUser,
  ) {
    const old = id ? await this.event(id, user) : undefined;
    if (
      dto.status &&
      !user.permissions.some((p) =>
        ['EVENT_PUBLISH', 'EVENT_MANAGE', 'EVENT_WRITE'].includes(p),
      )
    )
      throw new ForbiddenException();
    if (dto.smallGroupId)
      await this.groupsService.group(dto.smallGroupId, user);
    if (dto.ministryId) await this.groupsService.ministry(dto.ministryId, user);
    const { title, startDateTime, endDateTime, ...rest } = dto;
    const startsAt = startDateTime ? new Date(startDateTime) : old?.startsAt;
    const endsAt = endDateTime ? new Date(endDateTime) : old?.endsAt;
    if (!startsAt || !endsAt || endsAt <= startsAt)
      throw new BadRequestException('Fim deve ser posterior ao início.');
    return this.context.write(async (tx) => {
      if (id) await this.lockEvent(tx, id, user);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19009002)`;
      if (
        id &&
        dto.capacity &&
        (await tx.eventRegistration.count({
          where: { eventId: id, ...occupiedRegistrations() },
        })) > dto.capacity
      )
        throw new ConflictException('Capacidade inferior às inscrições.');
      if (
        id &&
        dto.isPaid !== undefined &&
        dto.isPaid !== old?.isPaid &&
        (await tx.eventRegistration.count({
          where: { eventId: id, ...occupiedRegistrations() },
        }))
      )
        throw new ConflictException(
          'Não é possível alterar a cobrança com inscrições ativas.',
        );
      if (
        id &&
        dto.isPaid === false &&
        (await tx.eventTicket.count({
          where: { eventId: id, price: { gt: 0 } },
        }))
      )
        throw new ConflictException('Altere os lotes para gratuitos primeiro.');
      const data = {
        ...rest,
        name: title,
        startsAt,
        endsAt,
        ...(dto.status === 'CANCELLED' ? { active: false } : {}),
      };
      const saved = await (id
        ? tx.communityEvent.update({ where: { id }, data })
        : tx.communityEvent.create({
            data: {
              ...data,
              name: title!,
              location: dto.location!,
              createdByUserId: user.id,
            },
          }));
      if (
        id &&
        (dto.startDateTime || dto.endDateTime) &&
        (await this.conflictsService.conflictCount(tx, undefined, id))
      )
        throw new ConflictException(
          'Alteração cria conflito entre voluntários escalados.',
        );
      if (id && dto.status === 'CANCELLED')
        await tx.volunteerSchedule.updateMany({
          where: { eventId: id, status: { in: ['DRAFT', 'PUBLISHED'] } },
          data: { status: 'CANCELLED' },
        });
      if (!id)
        await tx.eventManagerAssignment.create({
          data: {
            eventId: saved.id,
            userId: user.id,
            assignedByUserId: user.id,
          },
        });
      return saved;
    });
  }
  async registrations(id: string, q: D.OperationQuery, user: CurrentUser) {
    await this.event(id, user);
    const where = { eventId: id, status: q.status };
    const [items, total] = await this.db.$transaction([
      this.db.eventRegistration.findMany({
        where,
        include: personInclude,
        ...this.context.pagination(q),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.eventRegistration.count({ where }),
    ]);
    return this.context.page(items, total, q);
  }
  async register(id: string, dto: D.PersonDto, user: CurrentUser) {
    await this.event(id, user);
    return this.context.write(async (tx) => {
      await this.lockEvent(tx, id, user);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19009002)`;
      const e = await tx.communityEvent.findUniqueOrThrow({ where: { id } });
      if (e.isPaid)
        throw new BadRequestException(
          'Use o fluxo de inscrições do módulo de eventos para selecionar o ingresso.',
        );
      if (!e.active || e.status !== 'SCHEDULED')
        throw new ConflictException('Evento não aceita inscrições.');
      if (user.permissions.includes('EVENT_REGISTRATION_MANAGE')) {
        this.context.person(dto);
        await this.context.validMember(tx, dto.memberId);
        if (
          dto.visitorId &&
          !(await tx.visitor.findUnique({
            where: { id: dto.visitorId },
            select: { id: true },
          }))
        )
          throw new NotFoundException();
      } else await this.context.accessiblePerson(tx, dto, user);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19009001)`;
      const identity = await this.context.personIdentity(tx, dto);
      if (
        await tx.eventRegistration.findFirst({
          where: {
            eventId: id,
            ...identity,
            status: { in: ['REGISTERED', 'APPROVED'] },
          },
          select: { id: true },
        })
      )
        throw new ConflictException('Pessoa já inscrita.');
      const old = await tx.eventRegistration.findFirst({
        where: { eventId: id, ...identity },
      });
      if (old && ['REGISTERED', 'APPROVED'].includes(old.status))
        throw new ConflictException('Pessoa já inscrita.');
      if (
        e.capacity &&
        (await tx.eventRegistration.count({
          where: { eventId: id, ...occupiedRegistrations() },
        })) >= e.capacity
      )
        throw new ConflictException('Capacidade do evento atingida.');
      return old
        ? tx.eventRegistration.update({
            where: { id: old.id },
            data: { status: 'REGISTERED' },
          })
        : tx.eventRegistration.create({ data: { eventId: id, ...dto } });
    });
  }
  async cancelRegistration(
    id: string,
    registrationId: string,
    user: CurrentUser,
  ) {
    await this.event(id, user);
    return this.context.write(async (tx) => {
      await this.lockEvent(tx, id, user);
      const row = await tx.eventRegistration.findFirst({
        where: { id: registrationId, eventId: id },
      });
      if (!row) throw new NotFoundException();
      return tx.eventRegistration.update({
        where: { id: registrationId },
        data: { status: 'CANCELLED' },
      });
    });
  }
}
