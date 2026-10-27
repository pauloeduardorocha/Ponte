import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUser } from '@church/shared';
import { Prisma } from '@prisma/client';
import * as D from './operations.dto';
import { OperationsContext } from './operations-context';
import {
  operationalMemberSelect,
  groupInclude,
  ministryInclude,
} from './operations.projections';
export class OperationsGroupsService {
  constructor(private readonly context: OperationsContext) {}
  private get db() {
    return this.context.db;
  }

  async groups(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.SmallGroupWhereInput = {
      AND: [
        await this.context.groupScope(user),
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
        ...this.context.pagination(q),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.db.smallGroup.count({ where }),
    ]);
    return this.context.page(items, total, q);
  }
  async group(id: string, user: CurrentUser) {
    const g = await this.db.smallGroup.findFirst({
      where: { AND: [{ id }, await this.context.groupScope(user)] },
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
      !this.context.all(user) &&
      dto.leaderMemberId &&
      dto.leaderMemberId !== (await this.context.memberId(user))
    )
      throw new ForbiddenException('Mudança de liderança exige acesso global.');
    return this.context.write(async (tx) => {
      for (const member of [
        dto.leaderMemberId,
        dto.coLeaderMemberId,
        dto.hostMemberId,
      ])
        await this.context.validMember(tx, member);
      return id
        ? tx.smallGroup.update({ where: { id }, data: dto })
        : tx.smallGroup.create({ data: dto as D.SmallGroupDto });
    });
  }
  async ministries(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.MinistryWhereInput = {
      AND: [
        await this.context.ministryReadScope(user),
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
        ...this.context.pagination(q),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.db.ministry.count({ where }),
    ]);
    const scope = await this.context.ministryScope(user);
    const managed = await this.db.ministry.findMany({
      where: { AND: [scope, { id: { in: items.map((item) => item.id) } }] },
      select: { id: true },
    });
    const ids = new Set(managed.map((m) => m.id));
    return this.context.page(
      items.map((m) => ({ ...m, canManage: ids.has(m.id) })),
      total,
      q,
    );
  }
  async ministry(id: string, user: CurrentUser) {
    const m = await this.db.ministry.findFirst({
      where: { AND: [{ id }, await this.context.ministryReadScope(user)] },
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
      !this.context.all(user) ||
      (user.roles &&
        !user.roles.some((role) => ['ADMIN', 'SUPER_ADMIN'].includes(role)))
    )
      throw new ForbiddenException(
        'Apenas administradores podem criar ou editar ministérios.',
      );
    return this.context.write(async (tx) => {
      await this.context.validMember(tx, dto.leaderMemberId);
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
          ...this.context.pagination(q),
          orderBy: [{ joinedAt: 'desc' }, { id: 'asc' }],
        }),
        this.db.smallGroupMember.count({ where }),
      ]);
      return this.context.page(items, total, q);
    }
    const where = {
      ministryId: id,
      active: q.active ? q.active === 'true' : undefined,
    };
    const [items, total] = await this.db.$transaction([
      this.db.ministryMember.findMany({
        where,
        include: { member: { select: operationalMemberSelect } },
        ...this.context.pagination(q),
        orderBy: [{ joinedAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.ministryMember.count({ where }),
    ]);
    return this.context.page(items, total, q);
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
    if (kind === 'ministry') await this.context.canManageMinistry(id, user);
    return this.context.write(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
      await this.context.validMember(tx, dto.memberId);
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
    else await this.context.canManageMinistry(id, user);
    return this.context.write(async (tx) => {
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
}
