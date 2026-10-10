import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '@church/shared';
import Stripe from 'stripe';
import { PrismaService } from '../../database/prisma.service';
import { OperationsService } from '../operations/operations.service';
import { EventSignupDto } from './events.dto';
import { bindAudit } from '../audit/audit-context';

import { occupiedRegistrations } from './registration-capacity';
@Injectable()
export class EventSignupService {
  private readonly logger = new Logger(EventSignupService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly operations: OperationsService,
  ) {}
  private stripe() {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!key)
      throw new ServiceUnavailableException(
        'Pagamentos ainda não configurados.',
      );
    return new Stripe(key);
  }
  async profile(user: CurrentUser) {
    const account = await this.db.user.findUnique({
      where: { id: user.id },
      select: {
        member: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            anonymizedAt: true,
          },
        },
      },
    });
    const member = account?.member;
    if (!member || member.anonymizedAt || member.status !== 'ACTIVE')
      throw new BadRequestException('Conta sem membro ativo associado.');
    return {
      memberId: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
    };
  }
  async publicEvent(id: string) {
    const event = await this.db.communityEvent.findFirst({
      where: {
        id,
        publishedAt: { not: null },
        active: true,
        status: 'SCHEDULED',
      },
      select: {
        id: true,
        name: true,
        description: true,
        location: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        isPaid: true,
      },
    });
    if (!event) throw new NotFoundException();
    const used = await this.db.eventRegistration.count({
      where: { eventId: id, ...occupiedRegistrations() },
    });
    const tickets = await this.db.eventTicket.findMany({
      where: {
        eventId: id,
        startsAt: { lte: new Date() },
        endsAt: { gt: new Date() },
      },
      orderBy: { startsAt: 'asc' },
    });
    return {
      ...event,
      available:
        event.capacity === null ? null : Math.max(0, event.capacity - used),
      paymentsReady:
        !!this.config.get('STRIPE_SECRET_KEY') &&
        !!this.config.get('STRIPE_WEBHOOK_SECRET') &&
        !!this.config.get('PUBLIC_WEB_URL'),
      tickets: await Promise.all(
        tickets.map(async (t) => ({
          id: t.id,
          name: t.name,
          price: t.price.toFixed(2),
          available: Math.max(
            0,
            t.capacity -
              (await this.db.eventRegistration.count({
                where: { ticketId: t.id, ...occupiedRegistrations() },
              })),
          ),
        })),
      ),
    };
  }
  async signup(
    id: string,
    dto: EventSignupDto,
    user?: CurrentUser,
    managed = false,
  ) {
    if (!managed && (dto.memberId || dto.visitorId))
      throw new BadRequestException('Identidade inválida.');
    if (managed && user) await this.operations.event(id, user);
    const profile = user && !managed ? await this.profile(user) : undefined;
    const result = await this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      if (
        managed &&
        user &&
        !(await tx.communityEvent.findFirst({
          where: { AND: [{ id }, await this.operations.eventScope(user)] },
        }))
      )
        throw new NotFoundException();
      const event = await tx.communityEvent.findFirst({
        where: {
          id,
          active: true,
          status: 'SCHEDULED',
          ...(managed ? {} : { publishedAt: { not: null } }),
        },
      });
      if (!event || event.startsAt <= new Date())
        throw new ConflictException('Evento não aceita inscrições.');
      if (
        event.capacity !== null &&
        (await tx.eventRegistration.count({
          where: { eventId: id, ...occupiedRegistrations() },
        })) >= event.capacity
      )
        throw new ConflictException('Evento esgotado.');
      const ticket = dto.ticketId
        ? await tx.eventTicket.findFirst({
            where: {
              id: dto.ticketId,
              eventId: id,
              startsAt: { lte: new Date() },
              endsAt: { gt: new Date() },
            },
          })
        : null;
      if ((dto.ticketId && !ticket) || (event.isPaid && !ticket))
        throw new BadRequestException('Selecione um lote disponível.');
      if (
        ticket &&
        (await tx.eventRegistration.count({
          where: { ticketId: ticket.id, ...occupiedRegistrations() },
        })) >= ticket.capacity
      )
        throw new ConflictException('Lote esgotado.');
      const paid = event.isPaid && !!ticket && ticket.price.gt(0);
      if (
        paid &&
        (!this.config.get('STRIPE_WEBHOOK_SECRET') ||
          !this.config.get('PUBLIC_WEB_URL'))
      )
        throw new ServiceUnavailableException(
          'Pagamentos ainda não configurados.',
        );
      if (paid) this.stripe();
      let memberId = profile?.memberId ?? dto.memberId;
      let visitorId = dto.visitorId;
      if (memberId && visitorId)
        throw new BadRequestException('Selecione apenas uma pessoa.');
      if (visitorId) {
        const visitor = await tx.visitor.findUnique({
          where: { id: visitorId },
        });
        if (!visitor) throw new NotFoundException();
        if (visitor.memberId) {
          memberId = visitor.memberId;
          visitorId = undefined;
        }
      }
      if (
        memberId &&
        !(await tx.member.findFirst({
          where: { id: memberId, status: 'ACTIVE', anonymizedAt: null },
        }))
      )
        throw new BadRequestException('Selecione um membro ativo.');
      if (!memberId && !visitorId) {
        if (!dto.name?.trim() || !dto.email || !dto.phone)
          throw new BadRequestException('Informe nome, telefone e email.');
        // Never link an anonymous caller to an existing person by an unverified email.
        const visitor = await tx.visitor.create({
          data: {
            name: dto.name.trim(),
            firstName: dto.name.trim().split(' ')[0],
            lastName: dto.name.trim().split(' ').slice(1).join(' '),
            email: dto.email.toLowerCase(),
            phone: dto.phone,
            visitedAt: new Date(),
            createdByUserId: managed ? user?.id : undefined,
          },
        });
        visitorId = visitor.id;
      }
      const identity = memberId ? { memberId } : { visitorId: visitorId! };
      const prior = await tx.eventRegistration.findFirst({
        where: { eventId: id, ...identity },
      });
      if (
        prior &&
        (['REGISTERED', 'APPROVED'].includes(prior.status) ||
          (prior.status === 'PENDING_PAYMENT' &&
            prior.expiresAt &&
            prior.expiresAt > new Date()))
      )
        throw new ConflictException('Pessoa já inscrita.');
      const expiresAt = paid ? new Date(Date.now() + 35 * 60000) : null;
      const data = {
        ticketId: ticket?.id ?? null,
        status: paid ? 'PENDING_PAYMENT' : 'REGISTERED',
        expiresAt,
        communicationConsent: dto.communicationConsent ?? false,
        checkedInAt: null,
      };
      const registration = prior
        ? await tx.eventRegistration.update({ where: { id: prior.id }, data })
        : await tx.eventRegistration.create({
            data: { eventId: id, ...identity, ...data },
          });
      const payment = paid
        ? await tx.eventPayment.create({
            data: {
              eventId: id,
              registrationId: registration.id,
              amount: ticket!.price,
            },
          })
        : null;
      if (managed && user)
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'EVENT_REGISTRATION_CREATED',
            entity: 'CommunityEvent',
            entityId: id,
          },
        });
      const email =
        profile?.email ??
        (memberId
          ? (
              await tx.member.findUnique({
                where: { id: memberId },
                select: { email: true },
              })
            )?.email
          : (
              await tx.visitor.findUnique({
                where: { id: visitorId! },
                select: { email: true },
              })
            )?.email);
      return { registration, payment, event, ticket, email };
    });
    if (!result.payment)
      return {
        id: result.registration.id,
        registrationId: result.registration.id,
        status: 'REGISTERED',
      };
    const base = this.config.get<string>('PUBLIC_WEB_URL')!.replace(/\/$/, '');
    try {
      const session = await this.stripe().checkout.sessions.create(
        {
          mode: 'payment',
          managed_payments: { enabled: false },
          customer_email: result.email ?? undefined,
          client_reference_id: result.registration.id,
          metadata: { paymentId: result.payment.id },
          expires_at: Math.floor(
            result.registration.expiresAt!.getTime() / 1000,
          ),
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'eur',
                unit_amount: result.payment.amount.mul(100).toNumber(),
                product_data: {
                  name: `${result.event.name} — ${result.ticket!.name}`,
                },
              },
            },
          ],
          success_url: `${base}/events/${id}/register?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${base}/events/${id}/register?cancelled=true`,
        },
        { idempotencyKey: result.payment.id },
      );
      await this.db.eventPayment.update({
        where: { id: result.payment.id },
        data: { stripeSessionId: session.id },
      });
      return {
        id: result.registration.id,
        registrationId: result.registration.id,
        status: 'PENDING_PAYMENT',
        checkoutUrl: session.url,
      };
    } catch (error) {
      const stripeError =
        error instanceof Stripe.errors.StripeError ? error : undefined;
      const safeToken = (value: string | undefined) =>
        value?.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 120) ?? 'unknown';
      this.logger.warn(
        `Checkout failed; type=${safeToken(stripeError?.type)} code=${safeToken(stripeError?.code)} param=${safeToken(stripeError?.param)} request=${safeToken(stripeError?.requestId)}`,
      );
      const rejected =
        error instanceof Stripe.errors.StripeInvalidRequestError ||
        error instanceof Stripe.errors.StripeAuthenticationError ||
        error instanceof Stripe.errors.StripePermissionError;
      if (rejected) {
        await this.db.$transaction(async (tx) => {
          await bindAudit(tx);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
          const registration = await tx.eventRegistration.findUniqueOrThrow({
            where: { id: result.registration.id },
          });
          await tx.eventPayment.update({
            where: { id: result.payment!.id },
            data: { status: 'FAILED' },
          });
          if (
            registration.status === 'PENDING_PAYMENT' &&
            registration.expiresAt?.getTime() ===
              result.registration.expiresAt?.getTime()
          )
            await tx.eventRegistration.update({
              where: { id: registration.id },
              data: { status: 'CANCELLED', expiresAt: null },
            });
        });
        throw new ServiceUnavailableException({
          message:
            'A Stripe recusou a criação do pagamento. A organização precisa verificar a configuração; a vaga foi liberada.',
          ...(stripeError?.requestId
            ? { reference: safeToken(stripeError.requestId) }
            : {}),
        });
      }
      // Preserve the reservation on an ambiguous network failure; the signed webhook can still fulfil it.
      throw new ServiceUnavailableException(
        'Não foi possível abrir o pagamento. Aguarde 35 minutos para tentar novamente.',
      );
    }
  }
  async status(id: string, sessionId: string) {
    if (!sessionId || !/^cs_[A-Za-z0-9_]{10,250}$/.test(sessionId))
      throw new BadRequestException('Sessão inválida.');
    const payment = await this.db.eventPayment.findFirst({
      where: { eventId: id, stripeSessionId: sessionId },
      select: { status: true, refundedAmount: true },
    });
    if (!payment) throw new NotFoundException();
    return {
      status: payment.refundedAmount.gt(0) ? 'REFUNDED' : payment.status,
    };
  }
  async webhook(body: Buffer | undefined, signature: string | undefined) {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) throw new ServiceUnavailableException();
    let event: Stripe.Event;
    try {
      if (!body || !signature) throw new Error();
      event = this.stripe().webhooks.constructEvent(body, signature, secret);
    } catch {
      throw new BadRequestException('Assinatura Stripe inválida.');
    }
    if (
      ![
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.expired',
        'checkout.session.async_payment_failed',
      ].includes(event.type)
    )
      return { received: true };
    const session = event.data.object as Stripe.Checkout.Session;
    if (
      !session.metadata?.paymentId ||
      !/^[0-9a-f-]{36}$/i.test(session.metadata.paymentId)
    )
      return { received: true };
    await this.db.$transaction(
      async (tx) => {
        await bindAudit(tx);
        const payment = await tx.eventPayment.findUnique({
          where: { id: session.metadata?.paymentId ?? '' },
        });
        if (!payment) return;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payment.eventId}))`;
        const current = await tx.eventPayment.findUniqueOrThrow({
          where: { id: payment.id },
        });
        if (current.status !== 'PENDING') return;
        if (
          (current.stripeSessionId && current.stripeSessionId !== session.id) ||
          session.client_reference_id !== current.registrationId ||
          session.currency !== 'eur' ||
          session.amount_total !== current.amount.mul(100).toNumber()
        )
          throw new BadRequestException('Pagamento divergente.');
        const success =
          [
            'checkout.session.completed',
            'checkout.session.async_payment_succeeded',
          ].includes(event.type) && session.payment_status === 'paid';
        const failed = [
          'checkout.session.expired',
          'checkout.session.async_payment_failed',
        ].includes(event.type);
        if (!success && !failed) return;
        const registration = await tx.eventRegistration.findUniqueOrThrow({
          where: { id: current.registrationId },
        });
        const sameReservation =
          registration.status === 'PENDING_PAYMENT' &&
          registration.expiresAt &&
          Math.floor(registration.expiresAt.getTime() / 1000) ===
            session.expires_at;
        if (success) {
          const communityEvent = await tx.communityEvent.findUniqueOrThrow({
            where: { id: current.eventId },
          });
          const ticket = registration.ticketId
            ? await tx.eventTicket.findUnique({
                where: { id: registration.ticketId },
              })
            : null;
          const eventFull =
            communityEvent.capacity !== null &&
            (await tx.eventRegistration.count({
              where: {
                eventId: current.eventId,
                id: { not: registration.id },
                ...occupiedRegistrations(),
              },
            })) >= communityEvent.capacity;
          const ticketFull =
            ticket &&
            (await tx.eventRegistration.count({
              where: {
                ticketId: ticket.id,
                id: { not: registration.id },
                ...occupiedRegistrations(),
              },
            })) >= ticket.capacity;
          if (
            !sameReservation ||
            !communityEvent.active ||
            communityEvent.status !== 'SCHEDULED' ||
            eventFull ||
            ticketFull
          ) {
            if (typeof session.payment_intent !== 'string')
              throw new BadRequestException('Pagamento sem identificador.');
            await this.stripe().refunds.create(
              { payment_intent: session.payment_intent },
              { idempotencyKey: `event-unavailable-${current.id}` },
            );
            await tx.eventPayment.update({
              where: { id: current.id },
              data: {
                status: 'CONFIRMED',
                refundedAmount: current.amount,
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent,
              },
            });
            if (sameReservation)
              await tx.eventRegistration.update({
                where: { id: registration.id },
                data: { status: 'CANCELLED', expiresAt: null },
              });
            return;
          }
        }
        await tx.eventPayment.update({
          where: { id: current.id },
          data: {
            status: success ? 'CONFIRMED' : 'FAILED',
            stripeSessionId: session.id,
            stripePaymentIntentId:
              typeof session.payment_intent === 'string'
                ? session.payment_intent
                : null,
          },
        });
        // A late webhook must never revive a cancelled or newly reserved registration.
        if (sameReservation)
          await tx.eventRegistration.update({
            where: { id: registration.id },
            data: {
              status: success ? 'REGISTERED' : 'CANCELLED',
              expiresAt: null,
            },
          });
      },
      { timeout: 20000 },
    );
    return { received: true };
  }
}
