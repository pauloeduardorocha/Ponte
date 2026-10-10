import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CurrentUser } from '@church/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OperationsService } from '../operations/operations.service';
import { auditRequestFields, bindAudit } from '../audit/audit-context';
import { OperationQuery } from '../operations/operations.dto';
import * as D from './events.dto';
import { occupiedRegistrations } from './registration-capacity';

const paymentSelect = {
  id: true,
  registrationId: true,
  amount: true,
  discount: true,
  gatewayFee: true,
  refundedAmount: true,
  currency: true,
  status: true,
  createdAt: true,
} as const;
@Injectable()
export class EventsService {
  constructor(
    private readonly db: PrismaService,
    private readonly operations: OperationsService,
  ) {}
  private async write<T>(
    eventId: string,
    user: CurrentUser,
    action: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      // Shared with assignment revocation: access is checked inside the mutation transaction.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
      const event = await tx.communityEvent.findFirst({
        where: {
          AND: [{ id: eventId }, await this.operations.eventScope(user)],
        },
      });
      if (!event) throw new NotFoundException();
      let result: T;
      try {
        result = await fn(tx);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (['P2002', 'P2034'].includes(error.code))
            throw new ConflictException(
              'Registo duplicado ou alteração concorrente.',
            );
          if (['P2003', 'P2004', 'P2025'].includes(error.code))
            throw new BadRequestException('Vínculo ou dados inválidos.');
        }
        throw error;
      }
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action,
          entity: 'CommunityEvent',
          entityId: eventId,
          ...auditRequestFields(),
        },
      });
      return result;
    });
  }
  async managers(id: string, user: CurrentUser) {
    await this.operations.event(id, user);
    return this.db.eventManagerAssignment.findMany({
      where: { eventId: id },
      include: { user: { select: { id: true, name: true } } },
    });
  }
  async refunds(id: string, q: OperationQuery, user: CurrentUser) {
    await this.operations.event(id, user);
    return this.db.eventRefund.findMany({
      where: { payment: { eventId: id, registration: { eventId: id } } },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      orderBy: { createdAt: 'desc' },
    });
  }
  async sessionAttendance(
    id: string,
    sessionId: string,
    q: OperationQuery,
    user: CurrentUser,
  ) {
    await this.operations.event(id, user);
    if (
      !(await this.db.eventSession.findFirst({
        where: { id: sessionId, eventId: id },
      }))
    )
      throw new NotFoundException();
    return this.db.eventSessionCheckin.findMany({
      where: { sessionId, registration: { eventId: id } },
      select: {
        id: true,
        registrationId: true,
        checkedInAt: true,
        reversedAt: true,
      },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      orderBy: { checkedInAt: 'desc' },
    });
  }
  assign(id: string, dto: D.ManagerDto, user: CurrentUser, revoke = false) {
    return this.write(
      id,
      user,
      revoke ? 'EVENT_MANAGER_REVOKED' : 'EVENT_MANAGER_ASSIGNED',
      async (tx) => {
        const target = await tx.user.findFirst({
          where: { id: dto.userId, deletedAt: null, status: 'ACTIVE' },
        });
        if (!target) throw new NotFoundException();
        if (revoke) {
          const row = await tx.eventManagerAssignment.findUnique({
            where: { eventId_userId: { eventId: id, userId: dto.userId } },
          });
          if (!row) throw new NotFoundException();
          return tx.eventManagerAssignment.update({
            where: { id: row.id },
            data: { revokedAt: new Date() },
          });
        }
        return tx.eventManagerAssignment.upsert({
          where: { eventId_userId: { eventId: id, userId: dto.userId } },
          create: {
            eventId: id,
            userId: dto.userId,
            assignedByUserId: user.id,
          },
          update: {
            revokedAt: null,
            assignedByUserId: user.id,
            createdAt: new Date(),
          },
        });
      },
    );
  }
  publish(id: string, user: CurrentUser) {
    return this.write(id, user, 'EVENT_PUBLISHED', (tx) =>
      tx.communityEvent.update({
        where: { id },
        data: { publishedAt: new Date() },
      }),
    );
  }
  async resources(
    id: string,
    kind: 'tickets' | 'coupons' | 'sessions',
    q: OperationQuery,
    user: CurrentUser,
  ) {
    await this.operations.event(id, user);
    const args = {
      where: { eventId: id },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      orderBy: { id: 'asc' as const },
    };
    if (kind === 'tickets') {
      const tickets = await this.db.eventTicket.findMany(args);
      return Promise.all(
        tickets.map(async (t) => {
          const registered = await this.db.eventRegistration.count({
            where: { ticketId: t.id, ...occupiedRegistrations() },
          });
          return {
            ...t,
            registered,
            available: Math.max(0, t.capacity - registered),
          };
        }),
      );
    }
    if (kind === 'coupons') return this.db.eventCoupon.findMany(args);
    return this.db.eventSession.findMany(args);
  }
  ticket(id: string, dto: D.TicketDto, user: CurrentUser, ticketId?: string) {
    if (new Date(dto.endsAt) <= new Date(dto.startsAt))
      throw new BadRequestException('Período inválido');
    return this.write(id, user, 'EVENT_TICKET_PRICE_CHANGED', async (tx) => {
      if (
        ticketId &&
        !(await tx.eventTicket.findFirst({
          where: { id: ticketId, eventId: id },
        }))
      )
        throw new NotFoundException();
      const event = await tx.communityEvent.findUniqueOrThrow({
        where: { id },
      });
      if (!event.isPaid && dto.price > 0)
        throw new BadRequestException(
          'Evento gratuito só aceita lotes gratuitos.',
        );
      if (
        ticketId &&
        (await tx.eventRegistration.count({
          where: { ticketId, ...occupiedRegistrations() },
        })) > dto.capacity
      )
        throw new ConflictException('Quantidade inferior às vagas ocupadas.');
      const data = {
        ...dto,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
      };
      if (!ticketId)
        return tx.eventTicket.create({ data: { ...data, eventId: id } });
      return tx.eventTicket.update({ where: { id: ticketId }, data });
    });
  }
  coupon(id: string, dto: D.CouponDto, user: CurrentUser) {
    return this.write(
      id,
      user,
      dto.discountPercent === 100
        ? 'EVENT_COURTESY_GRANTED'
        : 'EVENT_COUPON_CREATED',
      (tx) =>
        tx.eventCoupon.create({
          data: {
            ...dto,
            code: dto.code.trim().toUpperCase(),
            courtesy: dto.discountPercent === 100,
            eventId: id,
          },
        }),
    );
  }
  session(id: string, dto: D.SessionDto, user: CurrentUser) {
    return this.write(id, user, 'EVENT_SESSION_CREATED', async (tx) => {
      const event = await tx.communityEvent.findUniqueOrThrow({
        where: { id },
      });
      const startsAt = new Date(dto.startsAt),
        endsAt = new Date(dto.endsAt);
      if (
        endsAt <= startsAt ||
        startsAt < event.startsAt ||
        !event.endsAt ||
        endsAt > event.endsAt
      )
        throw new BadRequestException('Sessão fora do período do evento');
      return tx.eventSession.create({
        data: { eventId: id, name: dto.name, startsAt, endsAt },
      });
    });
  }
  async payments(id: string, q: OperationQuery, user: CurrentUser) {
    await this.operations.event(id, user);
    const where = {
      eventId: id,
      registration: { eventId: id },
      status: q.status,
    };
    const [items, total] = await this.db.$transaction([
      this.db.eventPayment.findMany({
        where,
        select: paymentSelect,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.eventPayment.count({ where }),
    ]);
    return {
      items: items.map((p) => ({
        ...p,
        amount: p.amount.toFixed(2),
        discount: p.discount.toFixed(2),
        gatewayFee: p.gatewayFee.toFixed(2),
        refundedAmount: p.refundedAmount.toFixed(2),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  refund(id: string, paymentId: string, dto: D.RefundDto, user: CurrentUser) {
    return this.write(id, user, 'EVENT_REFUND_REQUESTED', async (tx) => {
      const payment = await tx.eventPayment.findFirst({
        where: {
          id: paymentId,
          eventId: id,
          registration: { eventId: id },
          status: 'CONFIRMED',
        },
      });
      if (!payment) throw new NotFoundException();
      if (payment.refundedAmount.gte(payment.amount.minus(payment.discount)))
        throw new ConflictException('Pagamento já reembolsado');
      if (
        await tx.eventRefund.findFirst({
          where: { paymentId, status: { in: ['REQUESTED', 'APPROVED'] } },
        })
      )
        throw new ConflictException('Reembolso já solicitado');
      return tx.eventRefund.create({
        data: { paymentId, reason: dto.reason, requestedByUserId: user.id },
      });
    });
  }
  approveRefund(id: string, refundId: string, user: CurrentUser) {
    return this.write(id, user, 'EVENT_REFUND_APPROVED', async (tx) => {
      const refund = await tx.eventRefund.findFirst({
        where: {
          id: refundId,
          payment: { eventId: id, registration: { eventId: id } },
        },
      });
      if (!refund) throw new NotFoundException();
      if (refund.status !== 'REQUESTED')
        throw new ConflictException('Reembolso já processado');
      return tx.eventRefund.update({
        where: { id: refundId },
        data: {
          approvedByUserId: user.id,
          approvedAt: new Date(),
          status: 'APPROVED',
          result: 'Aprovado; execução pendente de integração com gateway.',
        },
      });
    });
  }
  registration(
    id: string,
    registrationId: string,
    user: CurrentUser,
    approve: boolean,
  ) {
    return this.write(
      id,
      user,
      approve ? 'EVENT_REGISTRATION_APPROVED' : 'EVENT_ATTENDEE_UPDATED',
      async (tx) => {
        const row = await tx.eventRegistration.findFirst({
          where: { id: registrationId, eventId: id },
        });
        if (!row) throw new NotFoundException();
        if (approve && row.status !== 'REGISTERED')
          throw new ConflictException('Inscrição não elegível');
        return tx.eventRegistration.update({
          where: { id: row.id },
          data: {
            status: approve ? 'APPROVED' : 'CANCELLED',
            ...(!approve ? { checkedInAt: null } : {}),
          },
        });
      },
    );
  }
  checkin(id: string, dto: D.CheckinDto, user: CurrentUser, reverse = false) {
    return this.write(
      id,
      user,
      reverse ? 'EVENT_CHECKIN_REVERSED' : 'EVENT_CHECKIN',
      async (tx) => {
        const row = await tx.eventRegistration.findFirst({
          where: {
            eventId: id,
            qrToken: dto.qrToken,
            status: { in: ['REGISTERED', 'APPROVED'] },
          },
        });
        if (!row) throw new NotFoundException();
        if (dto.sessionId) {
          if (
            !(await tx.eventSession.findFirst({
              where: { id: dto.sessionId, eventId: id },
            }))
          )
            throw new NotFoundException();
          const key = { sessionId: dto.sessionId, registrationId: row.id };
          if (reverse) {
            const prior = await tx.eventSessionCheckin.findUnique({
              where: { sessionId_registrationId: key },
            });
            if (!prior) throw new NotFoundException();
            return tx.eventSessionCheckin.update({
              where: { id: prior.id },
              data: { reversedAt: new Date() },
            });
          }
          return tx.eventSessionCheckin.upsert({
            where: { sessionId_registrationId: key },
            create: key,
            update: { reversedAt: null, checkedInAt: new Date() },
          });
        }
        return tx.eventRegistration.update({
          where: { id: row.id },
          data: { checkedInAt: reverse ? null : new Date() },
        });
      },
    );
  }
  notify(id: string, dto: D.EventMessageDto, user: CurrentUser) {
    return this.write(id, user, 'EVENT_NOTIFICATION_SENT', async (tx) => {
      const recipients = await tx.eventRegistration.findMany({
        where: {
          eventId: id,
          status: { in: ['REGISTERED', 'APPROVED'] },
          communicationConsent: true,
        },
      });
      return tx.notification.createMany({
        data: recipients.map((r) => ({
          recipientMemberId: r.memberId,
          recipientVisitorId: r.visitorId,
          channel: 'INTERNAL',
          status: 'SENT',
          sentAt: new Date(),
          createdByUserId: user.id,
          subject: dto.subject,
          content: dto.content,
        })),
      });
    });
  }
  async report(id: string, user: CurrentUser, exporting = false) {
    await this.operations.event(id, user);
    const registrations = await this.db.eventRegistration.groupBy({
      by: ['status'],
      where: { eventId: id },
      _count: { _all: true },
    });
    const payments = await this.db.eventPayment.groupBy({
      by: ['currency', 'status'],
      where: { eventId: id, registration: { eventId: id } },
      _sum: {
        amount: true,
        discount: true,
        gatewayFee: true,
        refundedAmount: true,
      },
      _count: { _all: true },
    });
    const checkedIn = await this.db.eventRegistration.count({
      where: {
        eventId: id,
        checkedInAt: { not: null },
        status: { in: ['REGISTERED', 'APPROVED'] },
      },
    });
    const finances = payments.map((p) => ({
      currency: p.currency,
      status: p.status,
      count: p._count._all,
      amount: p._sum.amount?.toFixed(2) ?? '0.00',
      discounts: p._sum.discount?.toFixed(2) ?? '0.00',
      fees: p._sum.gatewayFee?.toFixed(2) ?? '0.00',
      refunds: p._sum.refundedAmount?.toFixed(2) ?? '0.00',
      net:
        p.status === 'CONFIRMED'
          ? (p._sum.amount ?? new Prisma.Decimal(0))
              .minus(p._sum.discount ?? 0)
              .minus(p._sum.gatewayFee ?? 0)
              .minus(p._sum.refundedAmount ?? 0)
              .toFixed(2)
          : '0.00',
    }));
    if (exporting)
      await this.db.auditLog.create({
        data: {
          userId: user.id,
          action: 'EVENT_REPORT_EXPORTED',
          entity: 'CommunityEvent',
          entityId: id,
          ...auditRequestFields(),
        },
      });
    return { eventId: id, registrations, checkedIn, finances };
  }
}
