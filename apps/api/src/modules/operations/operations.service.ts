import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { CurrentUser } from '@church/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { bindAudit, auditRequestFields } from '../audit/audit-context';
import * as D from './operations.dto';
import { initialPasswordHash } from '../members/member-identity';
import { PushService } from './push.service';
import type { PrivateUpload } from '../finance/storage.service';
import { randomUUID } from 'node:crypto';
import { occupiedRegistrations } from '../events/registration-capacity';
import {
  NOTIFICATION_PROVIDERS,
  type NotificationProvider,
} from './notification.provider';

// Explicit projections prevent accidental exposure as Member grows.
export const operationalMemberSelect = {
  id: true,
  name: true,
  status: true,
} as const;
const personInclude = {
  member: { select: operationalMemberSelect },
  visitor: { select: { id: true, name: true } },
} as const;
const followInclude = {
  ...personInclude,
  assignedTo: { select: { id: true, name: true } },
} as const;
const groupInclude = {
  leader: { select: operationalMemberSelect },
  coLeader: { select: operationalMemberSelect },
  host: { select: operationalMemberSelect },
} as const;
const ministryInclude = {
  leader: { select: operationalMemberSelect },
  members: {
    where: { active: true, leftAt: null, role: 'LEADER' },
    select: { member: { select: operationalMemberSelect } },
  },
} as const;
const eventInclude = {
  ministry: { select: { id: true, name: true } },
  smallGroup: { select: { id: true, name: true } },
} as const;
const scheduleInclude = {
  event: {
    select: {
      id: true,
      name: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
  },
  ministry: { select: { id: true, name: true } },
} as const;

@Injectable()
export class OperationsService {
  constructor(
    private readonly db: PrismaService,
    @Inject(NOTIFICATION_PROVIDERS)
    private readonly providers: NotificationProvider[],
    @Optional() private readonly push?: PushService,
  ) {}
  all(user: CurrentUser) {
    return user.permissions.includes('OPERATION_SCOPE_ALL');
  }
  private write<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(
      async (tx) => {
        await bindAudit(tx);
        try {
          return await fn(tx);
        } catch (e) {
          if (e instanceof Prisma.PrismaClientValidationError)
            throw new BadRequestException(
              'Dados inválidos. Confira os campos e vínculos.',
            );
          if (e instanceof Prisma.PrismaClientKnownRequestError) {
            if (['P2002', 'P2034'].includes(e.code))
              throw new ConflictException(
                'Registro duplicado ou alteração concorrente. Atualize a lista.',
              );
            if (['P2003', 'P2025', 'P2000', 'P2011', 'P2004'].includes(e.code))
              throw new BadRequestException('Vínculo inexistente ou inválido.');
          }
          throw e;
        }
      },
      { timeout: 30000 },
    );
  }
  private async memberId(user: CurrentUser) {
    return (
      (
        await this.db.user.findUnique({
          where: { id: user.id },
          select: { memberId: true },
        })
      )?.memberId ?? '00000000-0000-0000-0000-000000000000'
    );
  }
  async groupScope(user: CurrentUser): Promise<Prisma.SmallGroupWhereInput> {
    if (this.all(user)) return {};
    const id = await this.memberId(user);
    return {
      OR: [
        { leaderMemberId: id },
        { coLeaderMemberId: id },
        { hostMemberId: id },
      ],
    };
  }
  async ministryScope(user: CurrentUser): Promise<Prisma.MinistryWhereInput> {
    if (this.all(user)) return {};
    const memberId = await this.memberId(user);
    return {
      OR: [
        { leaderMemberId: memberId },
        {
          members: {
            some: { memberId, active: true, leftAt: null, role: 'LEADER' },
          },
        },
      ],
    };
  }
  private async ministryReadScope(
    user: CurrentUser,
  ): Promise<Prisma.MinistryWhereInput> {
    if (this.all(user)) return {};
    return {
      OR: [
        await this.ministryScope(user),
        {
          members: {
            some: {
              memberId: await this.memberId(user),
              active: true,
              leftAt: null,
            },
          },
        },
      ],
    };
  }
  private async canManageMinistry(id: string, user: CurrentUser) {
    if (
      !(await this.db.ministry.findFirst({
        where: { AND: [{ id }, await this.ministryScope(user)] },
        select: { id: true },
      }))
    )
      throw new ForbiddenException(
        'Apenas administradores e líderes deste ministério podem gerir.',
      );
  }
  async visitorScope(user: CurrentUser): Promise<Prisma.VisitorWhereInput> {
    return this.all(user) || user.permissions.includes('VISITOR_WRITE')
      ? {}
      : {
          OR: [
            { createdByUserId: user.id },
            { invitedByMemberId: await this.memberId(user) },
            { followUps: { some: { assignedToUserId: user.id } } },
          ],
        };
  }
  async eventScope(
    user: CurrentUser,
  ): Promise<Prisma.CommunityEventWhereInput> {
    if (this.all(user) || user.permissions.includes('EVENT_WRITE')) return {};
    // Granular event permissions require an active assignment. Legacy leaders retain their policy.
    if (!user.permissions.includes('EVENT_MANAGE'))
      return {
        managerAssignments: { some: { userId: user.id, revokedAt: null } },
      };
    return {
      OR: [
        { managerAssignments: { some: { userId: user.id, revokedAt: null } } },
        { createdByUserId: user.id },
        { smallGroup: await this.groupScope(user) },
        { ministry: await this.ministryScope(user) },
      ],
    };
  }
  private async scheduleScope(
    user: CurrentUser,
  ): Promise<Prisma.VolunteerScheduleWhereInput> {
    if (this.all(user)) return {};
    return {
      OR: [
        { ministryId: null, event: await this.eventScope(user) },
        { ministry: await this.ministryReadScope(user) },
        { assignments: { some: { memberId: await this.memberId(user) } } },
      ],
    };
  }
  private range(q: D.OperationQuery) {
    if (q.start && q.end && new Date(q.start) > new Date(q.end))
      throw new BadRequestException('Período inválido');
    return q.start || q.end
      ? {
          gte: q.start ? new Date(q.start) : undefined,
          lte: q.end
            ? new Date(
                new Date(q.end).getTime() +
                  (/^\d{4}-\d{2}-\d{2}$/.test(q.end) ? 86399999 : 0),
              )
            : undefined,
        }
      : undefined;
  }
  private page<T>(items: T[], total: number, q: D.OperationQuery) {
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  private pagination(q: D.OperationQuery) {
    return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
  }
  private async validMember(tx: Prisma.TransactionClient, id?: string | null) {
    if (
      id &&
      !(await tx.member.findFirst({
        where: { id, anonymizedAt: null, status: 'ACTIVE' },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Selecione um membro ativo.');
  }
  private person(dto: D.PersonDto) {
    if (Number(!!dto.memberId) + Number(!!dto.visitorId) !== 1)
      throw new BadRequestException(
        'Selecione exatamente um membro ou visitante.',
      );
  }
  private async personIdentity(tx: Prisma.TransactionClient, dto: D.PersonDto) {
    const memberId =
      dto.memberId ??
      (dto.visitorId
        ? (
            await tx.visitor.findUnique({
              where: { id: dto.visitorId },
              select: { memberId: true },
            })
          )?.memberId
        : null);
    return memberId
      ? { OR: [{ memberId }, { visitor: { memberId } }] }
      : { visitorId: dto.visitorId };
  }
  private async accessiblePerson(
    tx: Prisma.TransactionClient,
    dto: D.PersonDto,
    user: CurrentUser,
  ) {
    this.person(dto);
    if (
      dto.visitorId &&
      !(await tx.visitor.findFirst({
        where: { AND: [{ id: dto.visitorId }, await this.visitorScope(user)] },
        select: { id: true },
      }))
    )
      throw new NotFoundException();
    if (dto.memberId) {
      await this.validMember(tx, dto.memberId);
      if (!this.all(user)) {
        const id = await this.memberId(user);
        const allowed = await tx.member.findFirst({
          where: {
            id: dto.memberId,
            OR: [
              { id },
              {
                groupMemberships: {
                  some: {
                    active: true,
                    smallGroup: await this.groupScope(user),
                  },
                },
              },
              {
                ministryMemberships: {
                  some: {
                    active: true,
                    ministry: await this.ministryScope(user),
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
          },
          select: { id: true },
        });
        if (!allowed) throw new NotFoundException();
      }
    }
  }
  async people(q: D.OperationQuery, user: CurrentUser) {
    const id = await this.memberId(user);
    const directory =
      !!q.search &&
      q.search.trim().length >= 2 &&
      ((await this.db.ministry.count({
        where: await this.ministryScope(user),
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
      this.all(user) || directory
        ? {}
        : {
            OR: [
              { id },
              {
                groupMemberships: {
                  some: {
                    active: true,
                    smallGroup: await this.groupScope(user),
                  },
                },
              },
              {
                ministryMemberships: {
                  some: {
                    active: true,
                    ministry: await this.ministryScope(user),
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
        ...this.pagination(q),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.db.member.count({ where }),
    ]);
    return this.page(items, total, q);
  }
  async assignees(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.UserWhereInput = {
      status: 'ACTIVE',
      deletedAt: null,
      ...(!this.all(user) ? { id: user.id } : {}),
      name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
    };
    const [items, total] = await this.db.$transaction([
      this.db.user.findMany({
        where,
        select: { id: true, name: true },
        ...this.pagination(q),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.db.user.count({ where }),
    ]);
    return this.page(items, total, q);
  }
  async visitors(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.VisitorWhereInput = {
      AND: [
        await this.visitorScope(user),
        {
          status: q.status,
          visitedAt: this.range(q),
          name: q.search
            ? { contains: q.search, mode: 'insensitive' }
            : undefined,
        },
      ],
    };
    const [items, total] = await this.db.$transaction([
      this.db.visitor.findMany({
        where,
        ...this.pagination(q),
        orderBy: [{ visitedAt: 'desc' }, { id: 'asc' }],
        include: {
          invitedBy: { select: operationalMemberSelect },
          member: { select: operationalMemberSelect },
        },
      }),
      this.db.visitor.count({ where }),
    ]);
    return this.page(
      items.map((v) => ({ ...v, firstVisitDate: v.visitedAt })),
      total,
      q,
    );
  }
  async visitor(id: string, user: CurrentUser) {
    const v = await this.db.visitor.findFirst({
      where: { AND: [{ id }, await this.visitorScope(user)] },
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
    return this.write(async (tx) => {
      await this.validMember(tx, dto.invitedByMemberId);
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
    return this.write(async (tx) => {
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
      if (memberId) await this.validMember(tx, memberId);
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
      ...(!this.all(user)
        ? { assignedToUserId: user.id }
        : { assignedToUserId: q.assignedToUserId }),
      status: q.status,
      memberId: q.memberId,
      visitorId: q.visitorId,
      nextContactAt: this.range(q),
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
        ...this.pagination(q),
        orderBy: [{ nextContactAt: 'asc' }, { id: 'asc' }],
      }),
      this.db.followUp.count({ where }),
    ]);
    return this.page(items, total, q);
  }
  async followUp(id: string, user: CurrentUser) {
    const f = await this.db.followUp.findFirst({
      where: { id, ...(!this.all(user) ? { assignedToUserId: user.id } : {}) },
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
    return this.write(async (tx) => {
      const person = {
        memberId: dto.memberId ?? old?.memberId ?? undefined,
        visitorId: dto.visitorId ?? old?.visitorId ?? undefined,
      };
      if (!old) await this.accessiblePerson(tx, person, user);
      else this.person(person);
      if (old && (dto.memberId || dto.visitorId))
        throw new BadRequestException('O histórico não pode mudar de pessoa.');
      const assignedToUserId = dto.assignedToUserId ?? old?.assignedToUserId;
      if (!this.all(user) && assignedToUserId !== user.id)
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
        ...this.pagination(q),
        orderBy: [{ interactionDate: 'asc' }, { id: 'asc' }],
      }),
      this.db.followUpInteraction.count({ where: { followUpId: id } }),
    ]);
    return this.page(items, total, q);
  }
  async addInteraction(id: string, dto: D.InteractionDto, user: CurrentUser) {
    const f = await this.followUp(id, user);
    if (['COMPLETED', 'CANCELLED'].includes(f.status))
      throw new ConflictException(
        'Reabra o acompanhamento antes de registrar contato.',
      );
    return this.write(async (tx) => {
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
  async groups(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.SmallGroupWhereInput = {
      AND: [
        await this.groupScope(user),
        {
          active: q.active ? q.active === 'true' : undefined,
          leaderMemberId: q.leaderMemberId,
          meetingDay: q.meetingDay,
          name: q.search
            ? { contains: q.search, mode: 'insensitive' }
            : undefined,
        },
      ],
    };
    const [items, total] = await this.db.$transaction([
      this.db.smallGroup.findMany({
        where,
        include: groupInclude,
        ...this.pagination(q),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.db.smallGroup.count({ where }),
    ]);
    return this.page(items, total, q);
  }
  async group(id: string, user: CurrentUser) {
    const g = await this.db.smallGroup.findFirst({
      where: { AND: [{ id }, await this.groupScope(user)] },
      include: groupInclude,
    });
    if (!g) throw new NotFoundException();
    return g;
  }
  async saveGroup(
    id: string | undefined,
    dto: D.SmallGroupDto | D.SmallGroupPatch,
    user: CurrentUser,
  ) {
    if (id) await this.group(id, user);
    if (
      !this.all(user) &&
      dto.leaderMemberId &&
      dto.leaderMemberId !== (await this.memberId(user))
    )
      throw new ForbiddenException('Mudança de liderança exige acesso global.');
    return this.write(async (tx) => {
      for (const member of [
        dto.leaderMemberId,
        dto.coLeaderMemberId,
        dto.hostMemberId,
      ])
        await this.validMember(tx, member);
      return id
        ? tx.smallGroup.update({ where: { id }, data: dto })
        : tx.smallGroup.create({ data: dto as D.SmallGroupDto });
    });
  }
  async ministries(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.MinistryWhereInput = {
      AND: [
        await this.ministryReadScope(user),
        {
          ...(q.leaderMemberId
            ? {
                OR: [
                  { leaderMemberId: q.leaderMemberId },
                  {
                    members: {
                      some: {
                        memberId: q.leaderMemberId,
                        role: 'LEADER',
                        active: true,
                        leftAt: null,
                      },
                    },
                  },
                ],
              }
            : {}),
          active: q.active ? q.active === 'true' : undefined,
          name: q.search
            ? { contains: q.search, mode: 'insensitive' }
            : undefined,
        },
      ],
    };
    const [items, total] = await this.db.$transaction([
      this.db.ministry.findMany({
        where,
        include: ministryInclude,
        ...this.pagination(q),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.db.ministry.count({ where }),
    ]);
    const scope = await this.ministryScope(user);
    const managed = await this.db.ministry.findMany({
      where: { AND: [scope, { id: { in: items.map((item) => item.id) } }] },
      select: { id: true },
    });
    const ids = new Set(managed.map((m) => m.id));
    return this.page(
      items.map((m) => ({ ...m, canManage: ids.has(m.id) })),
      total,
      q,
    );
  }
  async ministry(id: string, user: CurrentUser) {
    const m = await this.db.ministry.findFirst({
      where: { AND: [{ id }, await this.ministryReadScope(user)] },
      include: ministryInclude,
    });
    if (!m) throw new NotFoundException();
    return m;
  }
  async saveMinistry(
    id: string | undefined,
    dto: D.MinistryDto | D.MinistryPatch,
    user: CurrentUser,
  ) {
    if (
      !this.all(user) ||
      (user.roles &&
        !user.roles.some((role) => ['ADMIN', 'SUPER_ADMIN'].includes(role)))
    )
      throw new ForbiddenException(
        'Apenas administradores podem criar ou editar ministérios.',
      );
    return this.write(async (tx) => {
      await this.validMember(tx, dto.leaderMemberId);
      const ministry = await (id
        ? tx.ministry.update({ where: { id }, data: dto })
        : tx.ministry.create({ data: dto as D.MinistryDto }));
      if (
        dto.leaderMemberId &&
        !(await tx.ministryMember.findFirst({
          where: {
            ministryId: ministry.id,
            memberId: dto.leaderMemberId,
            active: true,
          },
        }))
      )
        await tx.ministryMember.create({
          data: {
            ministryId: ministry.id,
            memberId: dto.leaderMemberId,
            role: 'LEADER',
          },
        });
      return ministry;
    });
  }
  async participants(
    kind: 'group' | 'ministry',
    id: string,
    q: D.OperationQuery,
    user: CurrentUser,
  ) {
    if (kind === 'group') await this.group(id, user);
    else await this.ministry(id, user);
    if (kind === 'group') {
      const where = {
        smallGroupId: id,
        active: q.active ? q.active === 'true' : undefined,
      };
      const [items, total] = await this.db.$transaction([
        this.db.smallGroupMember.findMany({
          where,
          include: { member: { select: operationalMemberSelect } },
          ...this.pagination(q),
          orderBy: [{ joinedAt: 'desc' }, { id: 'asc' }],
        }),
        this.db.smallGroupMember.count({ where }),
      ]);
      return this.page(items, total, q);
    }
    const where = {
      ministryId: id,
      active: q.active ? q.active === 'true' : undefined,
    };
    const [items, total] = await this.db.$transaction([
      this.db.ministryMember.findMany({
        where,
        include: { member: { select: operationalMemberSelect } },
        ...this.pagination(q),
        orderBy: [{ joinedAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.ministryMember.count({ where }),
    ]);
    return this.page(items, total, q);
  }
  async join(
    kind: 'group' | 'ministry',
    id: string,
    dto: D.ParticipantDto,
    user: CurrentUser,
  ) {
    const g =
      kind === 'group'
        ? await this.group(id, user)
        : await this.ministry(id, user);
    if (!g.active) throw new ConflictException('Cadastro inativo.');
    if (
      kind === 'ministry' &&
      dto.role &&
      !['MEMBER', 'LEADER'].includes(dto.role)
    )
      throw new BadRequestException('Função inválida para ministério.');
    if (kind === 'ministry') await this.canManageMinistry(id, user);
    return this.write(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
      await this.validMember(tx, dto.memberId);
      if (kind === 'group') {
        const current = await tx.smallGroup.findUniqueOrThrow({
          where: { id },
        });
        if (
          current.capacity &&
          (await tx.smallGroupMember.count({
            where: { smallGroupId: id, active: true },
          })) >= current.capacity
        )
          throw new ConflictException('Capacidade do grupo atingida.');
        return tx.smallGroupMember.create({
          data: { smallGroupId: id, ...dto },
        });
      }
      if (
        await tx.ministryMember.findFirst({
          where: { ministryId: id, memberId: dto.memberId, active: true },
        })
      )
        throw new ConflictException('Membro já cadastrado neste ministério.');
      return tx.ministryMember.create({ data: { ministryId: id, ...dto } });
    });
  }
  async leave(
    kind: 'group' | 'ministry',
    id: string,
    membershipId: string,
    user: CurrentUser,
  ) {
    if (kind === 'group') await this.group(id, user);
    else await this.canManageMinistry(id, user);
    return this.write(async (tx) => {
      if (kind === 'group') {
        const row = await tx.smallGroupMember.findFirst({
          where: { id: membershipId, smallGroupId: id, active: true },
        });
        if (!row) throw new NotFoundException();
        return tx.smallGroupMember.update({
          where: { id: membershipId },
          data: { active: false, leftAt: new Date() },
        });
      }
      const row = await tx.ministryMember.findFirst({
        where: { id: membershipId, ministryId: id, active: true },
      });
      if (!row) throw new NotFoundException();
      const ministry = await tx.ministry.findUniqueOrThrow({ where: { id } });
      if (ministry.leaderMemberId === row.memberId)
        throw new ConflictException(
          'Altere o líder principal antes de remover este integrante.',
        );
      return tx.ministryMember.update({
        where: { id: membershipId },
        data: { active: false, leftAt: new Date() },
      });
    });
  }
  async events(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.CommunityEventWhereInput = {
      AND: [
        await this.eventScope(user),
        {
          status: q.status,
          ministryId: q.ministryId,
          smallGroupId: q.smallGroupId,
          active: q.active ? q.active === 'true' : undefined,
          startsAt: this.range(q),
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
        ...this.pagination(q),
        orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.communityEvent.count({ where }),
    ]);
    return this.page(
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
      where: { AND: [{ id }, await this.eventScope(user)] },
      include: eventInclude,
    });
    if (!e) throw new NotFoundException();
    return e;
  }
  private async lockEvent(
    tx: Prisma.TransactionClient,
    id: string,
    user: CurrentUser,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    if (
      !(await tx.communityEvent.findFirst({
        where: { AND: [{ id }, await this.eventScope(user)] },
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
    if (dto.smallGroupId) await this.group(dto.smallGroupId, user);
    if (dto.ministryId) await this.ministry(dto.ministryId, user);
    const { title, startDateTime, endDateTime, ...rest } = dto;
    const startsAt = startDateTime ? new Date(startDateTime) : old?.startsAt;
    const endsAt = endDateTime ? new Date(endDateTime) : old?.endsAt;
    if (!startsAt || !endsAt || endsAt <= startsAt)
      throw new BadRequestException('Fim deve ser posterior ao início.');
    return this.write(async (tx) => {
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
        (await this.conflictCount(tx, undefined, id))
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
        ...this.pagination(q),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.eventRegistration.count({ where }),
    ]);
    return this.page(items, total, q);
  }
  async register(id: string, dto: D.PersonDto, user: CurrentUser) {
    await this.event(id, user);
    return this.write(async (tx) => {
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
        this.person(dto);
        await this.validMember(tx, dto.memberId);
        if (
          dto.visitorId &&
          !(await tx.visitor.findUnique({
            where: { id: dto.visitorId },
            select: { id: true },
          }))
        )
          throw new NotFoundException();
      } else await this.accessiblePerson(tx, dto, user);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19009001)`;
      const identity = await this.personIdentity(tx, dto);
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
    return this.write(async (tx) => {
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
  async schedules(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.VolunteerScheduleWhereInput = {
      AND: [
        await this.scheduleScope(user),
        {
          status: q.status,
          eventId: q.eventId,
          ministryId: q.ministryId,
          date: this.range(q),
          ...(q.memberId
            ? { assignments: { some: { memberId: q.memberId } } }
            : {}),
          title: q.search
            ? { contains: q.search, mode: 'insensitive' }
            : undefined,
        },
      ],
    };
    const [items, total] = await this.db.$transaction([
      this.db.volunteerSchedule.findMany({
        where,
        include: scheduleInclude,
        ...this.pagination(q),
        orderBy: [{ date: 'desc' }, { id: 'asc' }],
      }),
      this.db.volunteerSchedule.count({ where }),
    ]);
    const ministryScope = await this.ministryScope(user);
    const managed = await this.db.ministry.findMany({
      where: {
        AND: [
          ministryScope,
          {
            id: {
              in: items.flatMap((item) =>
                item.ministryId ? [item.ministryId] : [],
              ),
            },
          },
        ],
      },
      select: { id: true },
    });
    const ids = new Set(managed.map((m) => m.id));
    return this.page(
      items.map((item) => ({
        ...item,
        canManage:
          this.all(user) ||
          (item.ministryId
            ? ids.has(item.ministryId)
            : user.permissions.includes('SCHEDULE_MANAGE')),
      })),
      total,
      q,
    );
  }
  async schedule(id: string, user: CurrentUser, manage = false) {
    const scope =
      manage && !this.all(user)
        ? {
            OR: [
              { ministryId: null, event: await this.eventScope(user) },
              { ministry: await this.ministryScope(user) },
            ],
          }
        : await this.scheduleScope(user);
    const s = await this.db.volunteerSchedule.findFirst({
      where: { AND: [{ id }, scope] },
      include: scheduleInclude,
    });
    if (!s) throw new NotFoundException();
    return s;
  }
  async saveSchedule(
    id: string | undefined,
    dto: D.ScheduleDto | D.SchedulePatch,
    user: CurrentUser,
  ) {
    if (!id && !dto.eventId && !dto.ministryId)
      throw new BadRequestException('Selecione um ministério ou evento.');
    if (id) await this.schedule(id, user, true);
    if (dto.eventId) await this.event(dto.eventId, user);
    if (dto.ministryId) await this.canManageMinistry(dto.ministryId, user);
    return this.write(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19009002)`;
      const { date, ...rest } = dto;
      const saved = await (id
        ? tx.volunteerSchedule.update({
            where: { id },
            data: { ...rest, date: date ? new Date(date) : undefined },
          })
        : tx.volunteerSchedule.create({
            data: { ...(dto as D.ScheduleDto), date: new Date(date!) },
          }));
      if (id && (await this.conflictCount(tx, undefined, undefined, id)))
        throw new ConflictException(
          'Alteração cria conflito entre voluntários escalados.',
        );
      return saved;
    });
  }
  async deleteSchedule(id: string, user: CurrentUser) {
    await this.schedule(id, user, true);
    return this.write(async (tx) => {
      await tx.volunteerAssignment.updateMany({
        where: { scheduleId: id },
        data: { replacedByAssignmentId: null },
      });
      await tx.volunteerAssignment.deleteMany({ where: { scheduleId: id } });
      return tx.volunteerSchedule.delete({ where: { id } });
    });
  }
  async attachments(id: string, user: CurrentUser) {
    await this.schedule(id, user);
    return this.db.scheduleAttachment.findMany({
      where: { scheduleId: id, uploadComplete: true },
      select: { id: true, filename: true, mime: true, size: true },
      orderBy: { createdAt: 'asc' },
    });
  }
  async uploadAttachment(
    id: string,
    file: PrivateUpload,
    user: CurrentUser,
    totalSize?: number,
  ) {
    await this.schedule(id, user, true);
    if (!file || file.size > 5 * 1024 * 1024)
      throw new BadRequestException('O arquivo deve ter até 5 MB.');
    if (
      !file.buffer ||
      file.size !== file.buffer.length ||
      file.size < 1 ||
      !file.originalname ||
      file.originalname.length > 255 ||
      /[\\/:]/.test(file.originalname) ||
      [...file.originalname].some(
        (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
      )
    )
      throw new BadRequestException('Arquivo ou nome inválido.');
    if (
      totalSize !== undefined &&
      (!Number.isSafeInteger(totalSize) ||
        totalSize < file.size ||
        totalSize > 5 * 1024 * 1024)
    )
      throw new BadRequestException('Tamanho total inv\u00e1lido.');
    const signatures: Record<string, boolean> = {
      'application/pdf': file.buffer.subarray(0, 5).toString() === '%PDF-',
      'image/jpeg': file.buffer
        .subarray(0, 3)
        .equals(Buffer.from([255, 216, 255])),
      'image/png': file.buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    };
    if (Object.hasOwn(signatures, file.mimetype) && !signatures[file.mimetype])
      throw new BadRequestException('Assinatura do arquivo inválida.');
    const mime = Object.hasOwn(signatures, file.mimetype)
      ? file.mimetype
      : 'application/octet-stream';
    return this.write((tx) =>
      tx.scheduleAttachment.create({
        data: {
          scheduleId: id,
          filename: file.originalname,
          mime,
          size: totalSize ?? file.size,
          uploadComplete: totalSize === undefined || file.size === totalSize,
          content: new Uint8Array(file.buffer),
        },
        select: { id: true, filename: true, mime: true, size: true },
      }),
    );
  }
  async appendAttachment(
    id: string,
    attachmentId: string,
    offset: number,
    file: PrivateUpload,
    user: CurrentUser,
  ) {
    await this.schedule(id, user, true);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 1 ||
      !file?.buffer ||
      file.size < 1 ||
      file.size > 2 * 1024 * 1024 ||
      file.size !== file.buffer.length
    )
      throw new BadRequestException('Parte inv\u00e1lida.');
    return this.write(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${attachmentId},0))`;
      const current = await tx.scheduleAttachment.findFirst({
        where: { id: attachmentId, scheduleId: id, uploadComplete: false },
      });
      if (!current) throw new NotFoundException();
      if (
        current.content.length !== offset ||
        offset + file.size > current.size
      )
        throw new ConflictException('Parte fora de ordem ou tamanho excedido.');
      const content = Buffer.concat([
        Buffer.from(current.content),
        file.buffer,
      ]);
      return tx.scheduleAttachment.update({
        where: { id: attachmentId },
        data: {
          content: new Uint8Array(content),
          uploadComplete: content.length === current.size,
        },
        select: { id: true, filename: true, mime: true, size: true },
      });
    });
  }
  async attachment(
    id: string,
    attachmentId: string,
    user: CurrentUser,
    remove = false,
  ) {
    await this.schedule(id, user, remove);
    const file = await this.db.scheduleAttachment.findFirst({
      where: { id: attachmentId, scheduleId: id },
    });
    if (!file || (!remove && !file.uploadComplete))
      throw new NotFoundException();
    if (remove) {
      await this.write((tx) =>
        tx.scheduleAttachment.delete({ where: { id: attachmentId } }),
      );
      return null;
    }
    return file;
  }
  async assignments(id: string, q: D.OperationQuery, user: CurrentUser) {
    await this.schedule(id, user);
    const where = { scheduleId: id, status: q.status };
    const [items, total] = await this.db.$transaction([
      this.db.volunteerAssignment.findMany({
        where,
        include: { member: { select: operationalMemberSelect } },
        ...this.pagination(q),
        orderBy: { id: 'asc' },
      }),
      this.db.volunteerAssignment.count({ where }),
    ]);
    return this.page(items, total, q);
  }
  private async assignmentConflicts(
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

  async addAssignment(
    id: string,
    dto: D.AssignmentDto,
    user: CurrentUser,
    replacesId?: string,
  ) {
    const schedule = await this.schedule(id, user, true);
    if (['CANCELLED', 'COMPLETED'].includes(schedule.status))
      throw new ConflictException('Escala encerrada.');
    if (dto.ministryId) await this.canManageMinistry(dto.ministryId, user);
    return this.write(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19009002)`;
      if (schedule.ministryId) await this.validMember(tx, dto.memberId);
      else await this.accessiblePerson(tx, { memberId: dto.memberId }, user);
      if (
        schedule.ministryId &&
        !(await tx.ministryMember.findFirst({
          where: {
            ministryId: schedule.ministryId,
            memberId: dto.memberId,
            active: true,
          },
        })) &&
        !(await tx.ministry.findFirst({
          where: { id: schedule.ministryId, leaderMemberId: dto.memberId },
        }))
      )
        throw new BadRequestException('Selecione um membro deste ministério.');
      if (
        await tx.volunteerAssignment.findFirst({
          where: {
            scheduleId: id,
            memberId: dto.memberId,
            status: { in: ['INVITED', 'CONFIRMED'] },
            ...(replacesId ? { id: { not: replacesId } } : {}),
          },
        })
      )
        throw new ConflictException('Membro já escalado.');
      const conflicts = await this.assignmentConflicts(tx, dto.memberId, id);
      if (conflicts.length)
        throw new ConflictException({
          message:
            'Conflito de horário: escolha outro voluntário ou ajuste o evento.',
          conflicts,
        });
      if (replacesId) {
        const old = await tx.volunteerAssignment.findFirst({
          where: {
            id: replacesId,
            scheduleId: id,
            status: { in: ['INVITED', 'CONFIRMED', 'DECLINED', 'ABSENT'] },
          },
        });
        if (!old) throw new NotFoundException();
        await tx.volunteerAssignment.update({
          where: { id: old.id },
          data: { status: 'REPLACED' },
        });
      }
      const row = await tx.volunteerAssignment.create({
        data: { scheduleId: id, ...dto },
      });
      if (replacesId)
        await tx.volunteerAssignment.update({
          where: { id: replacesId },
          data: { replacedByAssignmentId: row.id },
        });
      return row;
    });
  }
  async identity(user: CurrentUser) {
    return {
      memberId:
        (
          await this.db.user.findUnique({
            where: { id: user.id },
            select: { memberId: true },
          })
        )?.memberId ?? null,
    };
  }
  async respond(
    id: string,
    assignmentId: string,
    dto: D.AssignmentResponseDto,
    user: CurrentUser,
  ) {
    return this.write(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19009002)`;
      const row = await tx.volunteerAssignment.findFirst({
        where: {
          id: assignmentId,
          scheduleId: id,
          memberId: await this.memberId(user),
        },
        include: { schedule: { select: { status: true } } },
      });
      if (!row) throw new NotFoundException();
      if (
        ['CANCELLED', 'COMPLETED'].includes(row.schedule.status) ||
        !['INVITED', 'CONFIRMED', 'DECLINED'].includes(row.status)
      )
        throw new ConflictException('Convocação encerrada.');
      if (
        dto.status === 'CONFIRMED' &&
        (await this.assignmentConflicts(tx, row.memberId, id)).length
      )
        throw new ConflictException('Conflito de horário.');
      return tx.volunteerAssignment.update({
        where: { id: assignmentId },
        data: {
          status: dto.status,
          confirmedAt: dto.status === 'CONFIRMED' ? new Date() : null,
        },
      });
    });
  }
  private async conflictCount(
    tx: Prisma.TransactionClient,
    user?: CurrentUser,
    eventId?: string,
    scheduleId?: string,
  ) {
    const own = user ? await this.memberId(user) : null;
    const scope =
      user && !this.all(user)
        ? Prisma.sql`AND (ea."createdByUserId"=${user.id}::uuid OR ma."leaderMemberId"=${own}::uuid OR ga."leaderMemberId"=${own}::uuid OR ga."coLeaderMemberId"=${own}::uuid OR ga."hostMemberId"=${own}::uuid OR a."memberId"=${own}::uuid)`
        : Prisma.empty;
    const [row] = await tx.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) FROM volunteer_assignments a JOIN volunteer_assignments b ON a."memberId"=b."memberId" AND a.id<b.id AND a."scheduleId"<>b."scheduleId"
      JOIN volunteer_schedules sa ON sa.id=a."scheduleId" JOIN volunteer_schedules sb ON sb.id=b."scheduleId"
      LEFT JOIN community_events ea ON ea.id=sa."eventId" LEFT JOIN community_events eb ON eb.id=sb."eventId"
      LEFT JOIN ministries ma ON ma.id=sa."ministryId" LEFT JOIN small_groups ga ON ga.id=ea."smallGroupId"
      WHERE a.status IN ('INVITED','CONFIRMED') AND b.status IN ('INVITED','CONFIRMED') AND sa.status IN ('DRAFT','PUBLISHED') AND sb.status IN ('DRAFT','PUBLISHED') AND COALESCE(ea.status,'SCHEDULED')<>'CANCELLED' AND COALESCE(eb.status,'SCHEDULED')<>'CANCELLED'
      AND COALESCE(ea."startsAt",sa.date)<COALESCE(eb."endsAt",eb."startsAt"+interval '1 hour',sb.date+interval '1 hour') AND COALESCE(eb."startsAt",sb.date)<COALESCE(ea."endsAt",ea."startsAt"+interval '1 hour',sa.date+interval '1 hour')
      ${eventId ? Prisma.sql`AND (ea.id=${eventId}::uuid OR eb.id=${eventId}::uuid)` : Prisma.empty}
      ${scheduleId ? Prisma.sql`AND (sa.id=${scheduleId}::uuid OR sb.id=${scheduleId}::uuid)` : Prisma.empty} ${scope}`;
    return Number(row?.count ?? 0);
  }
  async assignmentStatus(
    id: string,
    assignmentId: string,
    dto: D.AssignmentStatusDto,
    user: CurrentUser,
  ) {
    await this.schedule(id, user, true);
    return this.write(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19009002)`;
      const row = await tx.volunteerAssignment.findFirst({
        where: { id: assignmentId, scheduleId: id },
      });
      if (!row) throw new NotFoundException();
      if (row.status === 'REPLACED')
        throw new ConflictException('Voluntário substituído.');
      if (
        dto.status === 'CONFIRMED' &&
        (await this.assignmentConflicts(tx, row.memberId, id)).length
      )
        throw new ConflictException('Conflito de horário.');
      return tx.volunteerAssignment.update({
        where: { id: assignmentId },
        data: {
          status: dto.status,
          confirmedAt:
            dto.status === 'CONFIRMED' ? new Date() : row.confirmedAt,
        },
      });
    });
  }
  async notifications(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.NotificationWhereInput = {
      ...(!this.all(user) ? { createdByUserId: user.id } : {}),
      status: q.status,
      recipientMemberId: q.memberId,
      recipientVisitorId: q.visitorId,
      createdAt: this.range(q),
      subject: q.search
        ? { contains: q.search, mode: 'insensitive' }
        : undefined,
    };
    const [items, total] = await this.db.$transaction([
      this.db.notification.findMany({
        where,
        include: {
          recipientMember: { select: operationalMemberSelect },
          recipientVisitor: { select: { id: true, name: true } },
        },
        ...this.pagination(q),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.notification.count({ where }),
    ]);
    return this.page(items, total, q);
  }
  private async inboxWhere(
    user: CurrentUser,
  ): Promise<Prisma.NotificationWhereInput> {
    const memberId = await this.memberId(user);
    return {
      channel: { in: ['INTERNAL', 'PUSH'] },
      status: 'SENT',
      inboxDeletedAt: null,
      OR: [{ recipientMemberId: memberId }, { recipientVisitor: { memberId } }],
    };
  }
  async unread(user: CurrentUser) {
    return {
      count: await this.db.notification.count({
        where: { ...(await this.inboxWhere(user)), readAt: null },
      }),
    };
  }
  async readInbox(user: CurrentUser, id?: string) {
    const where = { ...(await this.inboxWhere(user)), ...(id ? { id } : {}) };
    return this.write(async (tx) => {
      if (
        id &&
        !(await tx.notification.findFirst({ where, select: { id: true } }))
      )
        throw new NotFoundException();
      return tx.notification.updateMany({
        where: { ...where, readAt: null },
        data: { readAt: new Date() },
      });
    });
  }
  async deleteInbox(user: CurrentUser, id: string) {
    const where = { ...(await this.inboxWhere(user)), id };
    return this.write(async (tx) => {
      const result = await tx.notification.updateMany({
        where,
        data: { inboxDeletedAt: new Date() },
      });
      if (!result.count) throw new NotFoundException();
      return result;
    });
  }
  async inbox(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.NotificationWhereInput = {
      ...(await this.inboxWhere(user)),
      subject: q.search
        ? { contains: q.search, mode: 'insensitive' }
        : undefined,
    };
    const [items, total] = await this.db.$transaction([
      this.db.notification.findMany({
        where,
        select: {
          id: true,
          subject: true,
          content: true,
          sentAt: true,
          readAt: true,
          createdAt: true,
        },
        ...this.pagination(q),
        orderBy: [{ sentAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.notification.count({ where }),
    ]);
    return this.page(items, total, q);
  }
  async notificationAudiences(
    kind: string,
    q: D.OperationQuery,
    user: CurrentUser,
  ) {
    const name = q.search
      ? { contains: q.search, mode: 'insensitive' as const }
      : undefined;
    const select = { id: true, name: true };
    const args = {
      select,
      ...this.pagination(q),
      orderBy: { name: 'asc' as const },
    };
    if (kind === 'small-groups') {
      const where = {
        AND: [await this.groupScope(user), { active: true, name }],
      };
      const [items, total] = await this.db.$transaction([
        this.db.smallGroup.findMany({ ...args, where }),
        this.db.smallGroup.count({ where }),
      ]);
      return this.page(items, total, q);
    }
    if (kind === 'ministries') {
      const where = {
        AND: [await this.ministryScope(user), { active: true, name }],
      };
      const [items, total] = await this.db.$transaction([
        this.db.ministry.findMany({ ...args, where }),
        this.db.ministry.count({ where }),
      ]);
      return this.page(items, total, q);
    }
    if (kind !== 'roles')
      throw new BadRequestException('Tipo de destinatário inválido.');
    if (!this.all(user)) throw new ForbiddenException();
    const where = q.search ? { OR: [{ name }, { displayName: name }] } : {};
    const [rows, total] = await this.db.$transaction([
      this.db.role.findMany({
        ...args,
        select: { ...select, displayName: true },
        where,
      }),
      this.db.role.count({ where }),
    ]);
    return this.page(
      rows.map((r) => ({ id: r.id, name: r.displayName || r.name })),
      total,
      q,
    );
  }
  async sendNotification(dto: D.NotificationDto, user: CurrentUser) {
    const {
      recipientMemberIds,
      recipientVisitorIds,
      smallGroupIds,
      ministryIds,
      roleIds,
      allMembers,
      ...message
    } = dto;
    const audienceCount = [
      dto.recipientMemberId,
      dto.recipientVisitorId,
      recipientMemberIds?.length,
      recipientVisitorIds?.length,
      smallGroupIds?.length,
      ministryIds?.length,
      roleIds?.length,
      allMembers,
    ].filter(Boolean).length;
    if (audienceCount !== 1)
      throw new BadRequestException(
        'Selecione exatamente um tipo de destinatário.',
      );
    if (
      !dto.scheduledAt &&
      !this.providers.some((p) => p.channel === dto.channel)
    )
      throw new ConflictException(
        'Canal preparado; configure um provedor antes de enviar.',
      );
    const bulk = !!(
      recipientMemberIds ||
      recipientVisitorIds ||
      smallGroupIds ||
      ministryIds ||
      roleIds ||
      allMembers
    );
    if (bulk) {
      if ((roleIds || allMembers) && !this.all(user))
        throw new ForbiddenException();
      const created = await this.write(async (tx) => {
        if (recipientMemberIds || recipientVisitorIds) {
          const ids = [...new Set(recipientMemberIds ?? recipientVisitorIds)];
          for (const id of ids) {
            await this.accessiblePerson(
              tx,
              recipientMemberIds ? { memberId: id } : { visitorId: id },
              user,
            );
          }
          return tx.notification.createManyAndReturn({
            data: ids.map((id) => ({
              ...message,
              ...(recipientMemberIds
                ? { recipientMemberId: id }
                : { recipientVisitorId: id }),
              scheduledAt: dto.scheduledAt
                ? new Date(dto.scheduledAt)
                : undefined,
              createdByUserId: user.id,
            })),
            select: { id: true },
          });
        }
        const filters: Prisma.MemberWhereInput[] = [];
        if (smallGroupIds) {
          const ids = [...new Set(smallGroupIds)];
          const groups = await tx.smallGroup.findMany({
            where: {
              AND: [
                await this.groupScope(user),
                { id: { in: ids }, active: true },
              ],
            },
            select: {
              id: true,
              leaderMemberId: true,
              coLeaderMemberId: true,
              hostMemberId: true,
            },
          });
          if (groups.length !== ids.length)
            throw new NotFoundException('Grupo familiar indisponível.');
          filters.push(
            {
              groupMemberships: {
                some: { smallGroupId: { in: ids }, active: true, leftAt: null },
              },
            },
            {
              id: {
                in: groups.flatMap((g) =>
                  [g.leaderMemberId, g.coLeaderMemberId, g.hostMemberId].filter(
                    (id): id is string => !!id,
                  ),
                ),
              },
            },
          );
        }
        if (ministryIds) {
          const ids = [...new Set(ministryIds)];
          const ministries = await tx.ministry.findMany({
            where: {
              AND: [
                await this.ministryScope(user),
                { id: { in: ids }, active: true },
              ],
            },
            select: { id: true, leaderMemberId: true },
          });
          if (ministries.length !== ids.length)
            throw new NotFoundException('Ministério indisponível.');
          filters.push(
            {
              ministryMemberships: {
                some: { ministryId: { in: ids }, active: true, leftAt: null },
              },
            },
            { id: { in: ministries.map((m) => m.leaderMemberId) } },
          );
        }
        if (roleIds) {
          const ids = [...new Set(roleIds)];
          if (
            (await tx.role.count({ where: { id: { in: ids } } })) !== ids.length
          )
            throw new NotFoundException('Role indisponível.');
          filters.push({
            user: {
              status: 'ACTIVE',
              deletedAt: null,
              userRoles: { some: { roleId: { in: ids } } },
            },
          });
        }
        const members = await tx.member.findMany({
          where: {
            status: 'ACTIVE',
            anonymizedAt: null,
            ...(allMembers ? {} : { OR: filters }),
          },
          select: { id: true },
        });
        if (!members.length)
          throw new BadRequestException(
            'Nenhum membro ativo encontrado para esta seleção.',
          );
        return tx.notification.createManyAndReturn({
          data: members.map((m) => ({
            ...message,
            recipientMemberId: m.id,
            scheduledAt: dto.scheduledAt
              ? new Date(dto.scheduledAt)
              : undefined,
            createdByUserId: user.id,
          })),
          select: { id: true },
        });
      });
      let sent = 0,
        failed = 0;
      if (!dto.scheduledAt) {
        for (const n of created) {
          const result = await this.notificationAction(n.id, user);
          if (result.status === 'SENT') sent++;
          else failed++;
        }
      }
      return {
        total: created.length,
        sent,
        failed,
        pending: dto.scheduledAt ? created.length : 0,
        status: dto.scheduledAt
          ? 'PENDING'
          : failed
            ? sent
              ? 'PARTIAL'
              : 'FAILED'
            : 'SENT',
      };
    }
    const created = await this.write(async (tx) => {
      await this.accessiblePerson(
        tx,
        { memberId: dto.recipientMemberId, visitorId: dto.recipientVisitorId },
        user,
      );
      return tx.notification.create({
        data: {
          ...message,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          createdByUserId: user.id,
        },
      });
    });
    return dto.scheduledAt
      ? created
      : this.notificationAction(created.id, user);
  }
  async notificationAction(id: string, user: CurrentUser, cancel = false) {
    const result = await this.write(async (tx) => {
      await tx.$queryRaw`SELECT id FROM notifications WHERE id=${id}::uuid FOR UPDATE`;
      const n = await tx.notification.findFirst({
        where: { id, ...(!this.all(user) ? { createdByUserId: user.id } : {}) },
      });
      if (!n) throw new NotFoundException();
      if (n.status !== 'PENDING')
        throw new ConflictException('Notificação já processada.');
      if (cancel)
        return tx.notification.update({
          where: { id },
          data: { status: 'CANCELLED' },
        });
      if (n.scheduledAt && n.scheduledAt > new Date())
        throw new ConflictException('Aguarde a data agendada.');
      const provider = this.providers.find((p) => p.channel === n.channel);
      if (!provider)
        throw new ConflictException(
          'Canal preparado; configure um provedor antes de enviar.',
        );
      try {
        await provider.send(n);
      } catch {
        return tx.notification.update({
          where: { id },
          data: {
            status: 'FAILED',
            error: 'Falha no provedor de comunicação.',
          },
        });
      }
      return tx.notification.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date(), error: null },
      });
    });
    if (!cancel && result.channel === 'INTERNAL' && result.status === 'SENT')
      await this.notifyInternal(result);
    return result;
  }
  async notifyInternal(
    notification: Parameters<PushService['notifyInternal']>[0],
  ) {
    await this.push?.notifyInternal(notification);
  }
  async templates(q: D.OperationQuery) {
    const where = {
      name: q.search
        ? { contains: q.search, mode: 'insensitive' as const }
        : undefined,
      active: q.active ? q.active === 'true' : undefined,
    };
    const [items, total] = await this.db.$transaction([
      this.db.notificationTemplate.findMany({
        where,
        ...this.pagination(q),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.db.notificationTemplate.count({ where }),
    ]);
    return this.page(items, total, q);
  }
  saveTemplate(id: string | undefined, dto: D.TemplateDto | D.TemplatePatch) {
    return this.write((tx) =>
      id
        ? tx.notificationTemplate.update({ where: { id }, data: dto })
        : tx.notificationTemplate.create({ data: dto as D.TemplateDto }),
    );
  }
  async visitorHistory(id: string, q: D.OperationQuery, user: CurrentUser) {
    await this.visitor(id, user);
    const where = {
      visitorId: id,
      ...(!this.all(user) ? { assignedToUserId: user.id } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.followUp.findMany({
        where,
        include: followInclude,
        ...this.pagination(q),
        orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      }),
      this.db.followUp.count({ where }),
    ]);
    return this.page(items, total, q);
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
      const scope = await this.visitorScope(user),
        where = { AND: [scope, { visitedAt: this.range(q) }] };
      result.visitors = await this.db.visitor.count({ where });
      if (p.includes('FOLLOWUP_READ'))
        result.followedVisitors = await this.db.visitor.count({
          where: {
            AND: [
              where,
              {
                followUps: {
                  some: {
                    ...(this.all(user) ? {} : { assignedToUserId: user.id }),
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
      const scope = this.all(user) ? {} : { assignedToUserId: user.id };
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
        where: { ...scope, status: 'COMPLETED', completedAt: this.range(q) },
      });
      result.nextContacts = await this.db.followUp.findMany({
        where,
        include: followInclude,
        orderBy: [{ nextContactAt: 'asc' }, { id: 'asc' }],
        take: 5,
      });
    }
    if (p.includes('SMALL_GROUP_READ')) {
      const scope = await this.groupScope(user);
      result.activeGroups = await this.db.smallGroup.count({
        where: { AND: [scope, { active: true }] },
      });
      result.groupParticipants = await this.db.smallGroupMember.count({
        where: { active: true, smallGroup: scope },
      });
    }
    if (p.includes('MINISTRY_READ')) {
      const scope = await this.ministryScope(user);
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
            await this.eventScope(user),
            { active: true, status: 'SCHEDULED', startsAt: { gte: now } },
          ],
        },
        select: { id: true, name: true, startsAt: true },
        take: 5,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      });
    if (p.includes('SCHEDULE_READ'))
      result.scheduleConflicts = await this.conflictCount(this.db, user);
    if (p.includes('SCHEDULE_READ'))
      result.upcomingSchedules = await this.db.volunteerSchedule.findMany({
        where: {
          AND: [
            await this.scheduleScope(user),
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
