import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUser } from '@church/shared';
import { Prisma } from '@prisma/client';
import * as D from './operations.dto';
import { PushService } from './push.service';
import { NotificationOutboxService } from './notification-outbox.service';
import { type NotificationProvider } from './notification.provider';
import { OperationsContext } from './operations-context';
import { operationalMemberSelect } from './operations.projections';
export class OperationsNotificationsService {
  constructor(
    private readonly context: OperationsContext,
    private readonly providers: NotificationProvider[],
    private readonly push?: PushService,
    private readonly outbox?: NotificationOutboxService,
  ) {}
  private get db() {
    return this.context.db;
  }

  private get deliveries() {
    return (
      this.outbox ??
      new NotificationOutboxService(this.db, this.providers, this.push)
    );
  }
  async notifications(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.NotificationWhereInput = {
      ...(!this.context.all(user) ? { createdByUserId: user.id } : {}),
      status: q.status,
      recipientMemberId: q.memberId,
      recipientVisitorId: q.visitorId,
      createdAt: this.context.range(q),
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
        ...this.context.pagination(q),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.notification.count({ where }),
    ]);
    return this.context.page(items, total, q);
  }
  async inboxWhere(user: CurrentUser): Promise<Prisma.NotificationWhereInput> {
    const memberId = await this.context.memberId(user);
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
    return this.context.write(async (tx) => {
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
    return this.context.write(async (tx) => {
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
        ...this.context.pagination(q),
        orderBy: [{ sentAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.notification.count({ where }),
    ]);
    return this.context.page(items, total, q);
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
      ...this.context.pagination(q),
      orderBy: { name: 'asc' as const },
    };
    if (kind === 'small-groups') {
      const where = {
        AND: [await this.context.groupScope(user), { active: true, name }],
      };
      const [items, total] = await this.db.$transaction([
        this.db.smallGroup.findMany({ ...args, where }),
        this.db.smallGroup.count({ where }),
      ]);
      return this.context.page(items, total, q);
    }
    if (kind === 'ministries') {
      const where = {
        AND: [await this.context.ministryScope(user), { active: true, name }],
      };
      const [items, total] = await this.db.$transaction([
        this.db.ministry.findMany({ ...args, where }),
        this.db.ministry.count({ where }),
      ]);
      return this.context.page(items, total, q);
    }
    if (kind !== 'roles')
      throw new BadRequestException('Tipo de destinatário inválido.');
    if (!this.context.all(user)) throw new ForbiddenException();
    const where = q.search ? { OR: [{ name }, { displayName: name }] } : {};
    const [rows, total] = await this.db.$transaction([
      this.db.role.findMany({
        ...args,
        select: { ...select, displayName: true },
        where,
      }),
      this.db.role.count({ where }),
    ]);
    return this.context.page(
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
      if ((roleIds || allMembers) && !this.context.all(user))
        throw new ForbiddenException();
      const created = await this.context.write(async (tx) => {
        if (recipientMemberIds || recipientVisitorIds) {
          const ids = [...new Set(recipientMemberIds ?? recipientVisitorIds)];
          for (const id of ids) {
            await this.context.accessiblePerson(
              tx,
              recipientMemberIds ? { memberId: id } : { visitorId: id },
              user,
            );
          }
          const notifications = await tx.notification.createManyAndReturn({
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
          await this.deliveries.enqueue(
            tx,
            notifications.map((n) => n.id),
            !!dto.scheduledAt,
          );
          return notifications;
        }
        const filters: Prisma.MemberWhereInput[] = [];
        if (smallGroupIds) {
          const ids = [...new Set(smallGroupIds)];
          const groups = await tx.smallGroup.findMany({
            where: {
              AND: [
                await this.context.groupScope(user),
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
                await this.context.ministryScope(user),
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
        const notifications = await tx.notification.createManyAndReturn({
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
        await this.deliveries.enqueue(
          tx,
          notifications.map((n) => n.id),
          !!dto.scheduledAt,
        );
        return notifications;
      });
      let sent = 0,
        failed = 0,
        pending = dto.scheduledAt ? created.length : 0;
      if (!dto.scheduledAt) {
        for (const n of created) {
          const result = await this.notificationAction(n.id, user);
          if (result.status === 'SENT') sent++;
          else if (result.status === 'PENDING') pending++;
          else failed++;
        }
      }
      return {
        total: created.length,
        sent,
        failed,
        pending,
        status:
          pending === created.length
            ? 'PENDING'
            : sent === created.length
              ? 'SENT'
              : failed === created.length
                ? 'FAILED'
                : 'PARTIAL',
      };
    }
    const created = await this.context.write(async (tx) => {
      await this.context.accessiblePerson(
        tx,
        { memberId: dto.recipientMemberId, visitorId: dto.recipientVisitorId },
        user,
      );
      const notification = await tx.notification.create({
        data: {
          ...message,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          createdByUserId: user.id,
        },
      });
      await this.deliveries.enqueue(tx, [notification.id], !!dto.scheduledAt);
      return notification;
    });
    return dto.scheduledAt
      ? created
      : this.notificationAction(created.id, user);
  }
  async notificationAction(id: string, user: CurrentUser, cancel = false) {
    return this.deliveries.dispatch(id, user, cancel);
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
        ...this.context.pagination(q),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.db.notificationTemplate.count({ where }),
    ]);
    return this.context.page(items, total, q);
  }
  saveTemplate(id: string | undefined, dto: D.TemplateDto | D.TemplatePatch) {
    return this.context.write((tx) =>
      id
        ? tx.notificationTemplate.update({ where: { id }, data: dto })
        : tx.notificationTemplate.create({ data: dto as D.TemplateDto }),
    );
  }
}
