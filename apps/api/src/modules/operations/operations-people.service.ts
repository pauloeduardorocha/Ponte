import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUser } from '@church/shared';
import { Prisma } from '@prisma/client';
import { auditRequestFields } from '../audit/audit-context';
import * as D from './operations.dto';
import { initialPasswordHash } from '../members/member-identity';
import { randomUUID } from 'node:crypto';
import { OperationsContext } from './operations-context';
import {
  operationalMemberSelect,
  followInclude,
} from './operations.projections';
export class OperationsPeopleService {
  constructor(private readonly context: OperationsContext) {}
  private get db() {
    return this.context.db;
  }

  async people(q: D.OperationQuery, user: CurrentUser) {
    const id = await this.context.memberId(user);
    const directory =
      !!q.search &&
      q.search.trim().length >= 2 &&
      ((await this.db.ministry.count({
        where: await this.context.ministryScope(user),
      })) > 0 ||
        user.permissions.some((p) =>
          [
            'SMALL_GROUP_MANAGE',
            'MINISTRY_MANAGE',
            'SCHEDULE_MANAGE',
            'EVENT_MANAGE',
            'EVENT_REGISTRATION_MANAGE',
            'VISITOR_CREATE',
          ].includes(p),
        ));
    const scope: Prisma.MemberWhereInput =
      this.context.all(user) || directory
        ? {}
        : {
            OR: [
              { id },
              {
                groupMemberships: {
                  some: {
                    active: true,
                    smallGroup: await this.context.groupScope(user),
                  },
                },
              },
              {
                ministryMemberships: {
                  some: {
                    active: true,
                    ministry: await this.context.ministryScope(user),
                  },
                },
              },
              { followUps: { some: { assignedToUserId: user.id } } },
              {
                convertedVisitor: {
                  followUps: { some: { assignedToUserId: user.id } },
                },
              },
            ],
          };
    const where: Prisma.MemberWhereInput = {
      AND: [
        scope,
        {
          status: 'ACTIVE',
          anonymizedAt: null,
          name: q.search
            ? { contains: q.search, mode: 'insensitive' }
            : undefined,
        },
      ],
    };
    const [items, total] = await this.db.$transaction([
      this.db.member.findMany({
        where,
        select: operationalMemberSelect,
        ...this.context.pagination(q),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.db.member.count({ where }),
    ]);
    return this.context.page(items, total, q);
  }
  async assignees(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.UserWhereInput = {
      status: 'ACTIVE',
      deletedAt: null,
      ...(!this.context.all(user) ? { id: user.id } : {}),
      name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
    };
    const [items, total] = await this.db.$transaction([
      this.db.user.findMany({
        where,
        select: { id: true, name: true },
        ...this.context.pagination(q),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.db.user.count({ where }),
    ]);
    return this.context.page(items, total, q);
  }
  async visitors(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.VisitorWhereInput = {
      AND: [
        await this.context.visitorScope(user),
        {
          status: q.status,
          visitedAt: this.context.range(q),
          name: q.search
            ? { contains: q.search, mode: 'insensitive' }
            : undefined,
        },
      ],
    };
    const [items, total] = await this.db.$transaction([
      this.db.visitor.findMany({
        where,
        ...this.context.pagination(q),
        orderBy: [{ visitedAt: 'desc' }, { id: 'asc' }],
        include: {
          invitedBy: { select: operationalMemberSelect },
          member: { select: operationalMemberSelect },
        },
      }),
      this.db.visitor.count({ where }),
    ]);
    return this.context.page(
      items.map((v) => ({ ...v, firstVisitDate: v.visitedAt })),
      total,
      q,
    );
  }
  async visitor(id: string, user: CurrentUser) {
    const v = await this.db.visitor.findFirst({
      where: { AND: [{ id }, await this.context.visitorScope(user)] },
    });
    if (!v) throw new NotFoundException();
    return v;
  }
  async saveVisitor(
    id: string | undefined,
    dto: D.OperationalVisitorDto | D.OperationalVisitorPatch,
    user: CurrentUser,
  ) {
    if (id) await this.visitor(id, user);
    return this.context.write(async (tx) => {
      await this.context.validMember(tx, dto.invitedByMemberId);
      const existing = id
        ? await tx.visitor.findUniqueOrThrow({ where: { id } })
        : undefined;
      if (existing?.memberId)
        throw new ConflictException(
          'Visitante convertido: retifique os dados no cadastro do membro.',
        );
      const { firstVisitDate, birthDate, ...rest } = dto;
      const data = {
        ...rest,
        name:
          dto.firstName === undefined && dto.lastName === undefined && existing
            ? existing.name
            : [
                dto.firstName ?? existing?.firstName,
                dto.lastName ?? existing?.lastName,
              ]
                .filter(Boolean)
                .join(' '),
        ...('name' in dto && typeof dto.name === 'string'
          ? { name: dto.name }
          : {}),
        birthDate:
          birthDate === null
            ? null
            : birthDate
              ? new Date(birthDate)
              : undefined,
        visitedAt: firstVisitDate ? new Date(firstVisitDate) : undefined,
      };
      return id
        ? tx.visitor.update({ where: { id }, data })
        : tx.visitor.create({
            data: {
              ...data,
              createdByUserId: user.id,
              firstName: dto.firstName!,
              lastName: dto.lastName ?? '',
              visitedAt: new Date(firstVisitDate!),
              name: data.name,
            },
          });
    });
  }
  async convertVisitor(
    id: string,
    dto: D.ConvertVisitorDto,
    user: CurrentUser,
  ) {
    await this.visitor(id, user);
    return this.context.write(async (tx) => {
      // Serialize conversions across visitors so concurrent matching cannot create two people.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19009001)`;
      const v = await tx.visitor.findUniqueOrThrow({ where: { id } });
      if (v.memberId)
        return {
          visitorId: v.id,
          memberId: v.memberId,
          alreadyConverted: true,
        };
      const matches = await tx.member.findMany({
        where: {
          OR: [
            ...(v.email
              ? [{ email: { equals: v.email, mode: 'insensitive' as const } }]
              : []),
            ...(v.phone ? [{ phone: v.phone }] : []),
            {
              name: { equals: v.name, mode: 'insensitive' },
              ...(v.birthDate ? { birthDate: v.birthDate } : {}),
            },
          ],
        },
        select: operationalMemberSelect,
      });
      if (!dto.memberId && matches.length)
        throw new ConflictException({
          message:
            'Há membros com dados semelhantes. Confirme o vínculo existente.',
          candidates: matches,
        });
      let memberId = dto.memberId;
      if (memberId && matches.length && !matches.some((m) => m.id === memberId))
        throw new ConflictException(
          'Selecione uma das correspondências existentes.',
        );
      if (memberId) await this.context.validMember(tx, memberId);
      else {
        const email =
          v.email?.toLowerCase() ?? `sememail+${randomUUID()}@aponte.pt`;
        memberId = (
          await tx.member.create({
            data: {
              name: v.name,
              email,
              user: {
                create: {
                  name: v.name,
                  email,
                  passwordHash: await initialPasswordHash(),
                  status: 'ACTIVE',
                },
              },
              phone: v.phone,
              birthDate: v.birthDate,
            },
            select: { id: true },
          })
        ).id;
      }
      if (
        await tx.visitor.findFirst({
          where: { memberId, id: { not: id } },
          select: { id: true },
        })
      )
        throw new ConflictException('Membro já vinculado a outro visitante.');
      await tx.visitor.update({
        where: { id },
        data: {
          memberId,
          status: 'INTEGRATED',
          convertedAt: new Date(),
          convertedByUserId: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'VISITOR_CONVERT',
          ...auditRequestFields(),
          entity: 'Visitor',
          entityId: id,
          metadata: { memberId },
        },
      });
      return { visitorId: id, memberId, alreadyConverted: false };
    });
  }
  async followUps(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.FollowUpWhereInput = {
      ...(!this.context.all(user)
        ? { assignedToUserId: user.id }
        : { assignedToUserId: q.assignedToUserId }),
      status: q.status,
      memberId: q.memberId,
      visitorId: q.visitorId,
      nextContactAt: this.context.range(q),
      ...(q.search
        ? {
            OR: [
              { member: { name: { contains: q.search, mode: 'insensitive' } } },
              {
                visitor: { name: { contains: q.search, mode: 'insensitive' } },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.followUp.findMany({
        where,
        include: followInclude,
        ...this.context.pagination(q),
        orderBy: [{ nextContactAt: 'asc' }, { id: 'asc' }],
      }),
      this.db.followUp.count({ where }),
    ]);
    return this.context.page(items, total, q);
  }
  async followUp(id: string, user: CurrentUser) {
    const f = await this.db.followUp.findFirst({
      where: {
        id,
        ...(!this.context.all(user) ? { assignedToUserId: user.id } : {}),
      },
      include: followInclude,
    });
    if (!f) throw new NotFoundException();
    return f;
  }
  async saveFollowUp(
    id: string | undefined,
    dto: D.FollowUpDto | D.FollowUpPatch,
    user: CurrentUser,
  ) {
    const old = id ? await this.followUp(id, user) : undefined;
    return this.context.write(async (tx) => {
      const person = {
        memberId: dto.memberId ?? old?.memberId ?? undefined,
        visitorId: dto.visitorId ?? old?.visitorId ?? undefined,
      };
      if (!old) await this.context.accessiblePerson(tx, person, user);
      else this.context.person(person);
      if (old && (dto.memberId || dto.visitorId))
        throw new BadRequestException('O histórico não pode mudar de pessoa.');
      const assignedToUserId = dto.assignedToUserId ?? old?.assignedToUserId;
      if (!this.context.all(user) && assignedToUserId !== user.id)
        throw new ForbiddenException(
          'Atribuição a outro responsável exige acesso global.',
        );
      if (
        !(await tx.user.findFirst({
          where: { id: assignedToUserId, status: 'ACTIVE', deletedAt: null },
          select: { id: true },
        }))
      )
        throw new BadRequestException('Responsável inválido.');
      const { startedAt, nextContactAt, ...rest } = dto;
      const data = {
        ...rest,
        startedAt: startedAt ? new Date(startedAt) : undefined,
        nextContactAt: nextContactAt ? new Date(nextContactAt) : undefined,
        completedAt:
          dto.status === 'COMPLETED'
            ? new Date()
            : dto.status
              ? null
              : undefined,
      };
      const f = id
        ? await tx.followUp.update({ where: { id }, data })
        : await tx.followUp.create({
            data: { ...data, assignedToUserId: assignedToUserId!, ...person },
          });
      if (
        person.visitorId &&
        (!dto.status || !['COMPLETED', 'CANCELLED'].includes(dto.status))
      )
        await tx.visitor.update({
          where: { id: person.visitorId },
          data: { status: 'IN_FOLLOW_UP' },
        });
      return f;
    });
  }
  async interactions(id: string, q: D.OperationQuery, user: CurrentUser) {
    await this.followUp(id, user);
    const [items, total] = await this.db.$transaction([
      this.db.followUpInteraction.findMany({
        where: { followUpId: id },
        include: { performedBy: { select: { id: true, name: true } } },
        ...this.context.pagination(q),
        orderBy: [{ interactionDate: 'asc' }, { id: 'asc' }],
      }),
      this.db.followUpInteraction.count({ where: { followUpId: id } }),
    ]);
    return this.context.page(items, total, q);
  }
  async addInteraction(id: string, dto: D.InteractionDto, user: CurrentUser) {
    const f = await this.followUp(id, user);
    if (['COMPLETED', 'CANCELLED'].includes(f.status))
      throw new ConflictException(
        'Reabra o acompanhamento antes de registrar contato.',
      );
    return this.context.write(async (tx) => {
      const interaction = await tx.followUpInteraction.create({
        data: {
          ...dto,
          followUpId: id,
          interactionDate: new Date(dto.interactionDate),
          nextActionAt: dto.nextActionAt
            ? new Date(dto.nextActionAt)
            : undefined,
          performedByUserId: user.id,
        },
      });
      await tx.followUp.update({
        where: { id },
        data: {
          status: 'IN_PROGRESS',
          nextContactAt: dto.nextActionAt
            ? new Date(dto.nextActionAt)
            : undefined,
        },
      });
      return interaction;
    });
  }
  async visitorHistory(id: string, q: D.OperationQuery, user: CurrentUser) {
    await this.visitor(id, user);
    const where = {
      visitorId: id,
      ...(!this.context.all(user) ? { assignedToUserId: user.id } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.followUp.findMany({
        where,
        include: followInclude,
        ...this.context.pagination(q),
        orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      }),
      this.db.followUp.count({ where }),
    ]);
    return this.context.page(items, total, q);
  }
}
