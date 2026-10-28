import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUser } from '@church/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { bindAudit } from '../audit/audit-context';
import * as D from './operations.dto';
export class OperationsContext {
  constructor(readonly db: PrismaService) {}
  all(user: CurrentUser) {
    return user.permissions.includes('OPERATION_SCOPE_ALL');
  }
  write<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
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
  async memberId(user: CurrentUser) {
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
  async ministryReadScope(
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
  async canManageMinistry(id: string, user: CurrentUser) {
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
  async scheduleScope(
    user: CurrentUser,
  ): Promise<Prisma.VolunteerScheduleWhereInput> {
    if (this.all(user)) return {};
    return {
      ministry: await this.ministryReadScope(user),
    };
  }
  range(q: D.OperationQuery) {
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
  page<T>(items: T[], total: number, q: D.OperationQuery) {
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  pagination(q: D.OperationQuery) {
    return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
  }
  async validMember(tx: Prisma.TransactionClient, id?: string | null) {
    if (
      id &&
      !(await tx.member.findFirst({
        where: { id, anonymizedAt: null, status: 'ACTIVE' },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Selecione um membro ativo.');
  }
  person(dto: D.PersonDto) {
    if (Number(!!dto.memberId) + Number(!!dto.visitorId) !== 1)
      throw new BadRequestException(
        'Selecione exatamente um membro ou visitante.',
      );
  }
  async personIdentity(tx: Prisma.TransactionClient, dto: D.PersonDto) {
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
  async accessiblePerson(
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
}
