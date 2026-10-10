import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { EventSignupService } from './event-signup.service';
import { PrismaService } from '../../database/prisma.service';
import { OperationsService } from '../operations/operations.service';
const eventId = '11111111-1111-4111-8111-111111111111';
const registrationId = '22222222-2222-4222-8222-222222222222';
const paymentId = '33333333-3333-4333-8333-333333333333';
describe('Public event registration', () => {
  const secret = 'whsec_event_test';
  let tx: ReturnType<typeof createTx>,
    db: {
      $transaction: jest.Mock;
      eventPayment: ReturnType<typeof createTx>['eventPayment'];
    },
    service: EventSignupService;
  const expiresAt = new Date(Date.now() + 35 * 60000);
  function createTx() {
    return {
      $executeRaw: jest.fn(),
      communityEvent: {
        findFirst: jest.fn().mockResolvedValue({
          id: eventId,
          active: true,
          status: 'SCHEDULED',
          isPaid: false,
          startsAt: new Date('2030-01-01'),
          capacity: 10,
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          capacity: 10,
          active: true,
          status: 'SCHEDULED',
        }),
      },
      eventRegistration: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: registrationId }),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: registrationId,
          status: 'PENDING_PAYMENT',
          expiresAt,
          ticketId: null,
        }),
      },
      visitor: {
        create: jest.fn().mockResolvedValue({ id: 'visitor' }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ email: 'visitor@example.org' }),
      },
      member: { findFirst: jest.fn().mockResolvedValue({ id: 'member' }) },
      eventTicket: { findFirst: jest.fn().mockResolvedValue(null) },
      eventPayment: {
        create: jest
          .fn()
          .mockResolvedValue({ id: paymentId, amount: new Prisma.Decimal(20) }),
        findUnique: jest.fn().mockResolvedValue({ id: paymentId, eventId }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: paymentId,
          eventId,
          registrationId,
          status: 'PENDING',
          stripeSessionId: 'cs_test_example',
          amount: new Prisma.Decimal(20),
        }),
        update: jest.fn(),
      },
    };
  }
  beforeEach(() => {
    tx = createTx();
    db = {
      eventPayment: tx.eventPayment,
      $transaction: jest.fn(
        async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    };
    service = new EventSignupService(
      db as unknown as PrismaService,
      new ConfigService({
        STRIPE_SECRET_KEY: 'sk_test_example',
        STRIPE_WEBHOOK_SECRET: secret,
      }),
      {} as OperationsService,
    );
  });
  it('creates a visitor and a free registration atomically with communication preference', async () => {
    const result = await service.signup(eventId, {
      name: 'Maria Silva',
      email: 'maria@example.org',
      phone: '+351912345678',
      communicationConsent: true,
    });
    expect(result.status).toBe('REGISTERED');
    expect(tx.visitor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Maria Silva',
          email: 'maria@example.org',
        }),
      }),
    );
    expect(tx.eventRegistration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        visitorId: 'visitor',
        communicationConsent: true,
        status: 'REGISTERED',
      }),
    });
  });
  it('rejects impersonation of a member or existing visitor on a public request', async () => {
    await expect(
      service.signup(eventId, { memberId: registrationId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.signup(eventId, { visitorId: registrationId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects an exhausted event before creating a visitor', async () => {
    tx.eventRegistration.count.mockResolvedValue(10);
    await expect(
      service.signup(eventId, {
        name: 'Maria',
        email: 'maria@example.org',
        phone: '912345678',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.visitor.create).not.toHaveBeenCalled();
  });
  it('rejects tickets that do not belong to the event', async () => {
    await expect(
      service.signup(eventId, { ticketId: registrationId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.visitor.create).not.toHaveBeenCalled();
  });
  it('does not reserve a paid registration before Stripe is configured', async () => {
    tx.communityEvent.findFirst.mockResolvedValue({
      isPaid: true,
      startsAt: new Date('2030-01-01'),
      capacity: null,
    });
    tx.eventTicket.findFirst.mockResolvedValue({
      id: registrationId,
      price: new Prisma.Decimal(20),
      capacity: 5,
    });
    await expect(
      service.signup(eventId, { ticketId: registrationId }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(tx.visitor.create).not.toHaveBeenCalled();
  });

  it('creates Checkout from the server ticket price and reserves the seat before redirecting', async () => {
    service = new EventSignupService(
      db as unknown as PrismaService,
      new ConfigService({
        STRIPE_SECRET_KEY: 'sk_test_example',
        STRIPE_WEBHOOK_SECRET: secret,
        PUBLIC_WEB_URL: 'https://ponte.example',
      }),
      {} as OperationsService,
    );
    tx.communityEvent.findFirst.mockResolvedValue({
      id: eventId,
      name: 'Retiro',
      isPaid: true,
      startsAt: new Date('2030-01-01'),
      capacity: 5,
    });
    tx.eventTicket.findFirst.mockResolvedValue({
      id: 'ticket',
      name: 'Primeiro lote',
      capacity: 5,
      price: new Prisma.Decimal(20),
    });
    tx.eventRegistration.create.mockResolvedValue({
      id: registrationId,
      expiresAt,
    });
    const stripe = new Stripe('sk_test_example');
    const checkout = jest
      .spyOn(stripe.checkout.sessions, 'create')
      .mockResolvedValue({
        id: 'cs_test_example',
        url: 'https://checkout.stripe.com/example',
      } as Stripe.Response<Stripe.Checkout.Session>);
    jest
      .spyOn(service as unknown as { stripe(): Stripe }, 'stripe')
      .mockReturnValue(stripe);
    const result = await service.signup(eventId, {
      ticketId: 'ticket',
      name: 'Maria',
      email: 'maria@example.org',
      phone: '912345678',
    });
    expect(result.checkoutUrl).toBe('https://checkout.stripe.com/example');
    expect(checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        metadata: { paymentId },
        line_items: [
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({
              currency: 'eur',
              unit_amount: 2000,
            }),
          }),
        ],
      }),
      { idempotencyKey: paymentId },
    );
    expect(tx.eventRegistration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: 'ticket',
        status: 'PENDING_PAYMENT',
      }),
    });
  });
  it('rejects an exhausted lot even when the event still has available seats', async () => {
    tx.eventTicket.findFirst.mockResolvedValue({
      id: 'ticket',
      capacity: 1,
      price: new Prisma.Decimal(0),
    });
    tx.eventRegistration.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    await expect(
      service.signup(eventId, { ticketId: 'ticket' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.visitor.create).not.toHaveBeenCalled();
  });

  it('releases the reservation when Stripe definitively rejects Checkout creation', async () => {
    service = new EventSignupService(
      db as unknown as PrismaService,
      new ConfigService({
        STRIPE_SECRET_KEY: 'sk_test_example',
        STRIPE_WEBHOOK_SECRET: secret,
        PUBLIC_WEB_URL: 'https://ponte.example',
      }),
      {} as OperationsService,
    );
    tx.communityEvent.findFirst.mockResolvedValue({
      id: eventId,
      name: 'Retiro',
      isPaid: true,
      startsAt: new Date('2030-01-01'),
      capacity: 5,
    });
    tx.eventTicket.findFirst.mockResolvedValue({
      id: 'ticket',
      name: 'Lote',
      capacity: 5,
      price: new Prisma.Decimal(20),
    });
    tx.eventRegistration.create.mockResolvedValue({
      id: registrationId,
      expiresAt,
    });
    const stripe = new Stripe('sk_test_example');
    jest
      .spyOn(stripe.checkout.sessions, 'create')
      .mockRejectedValue(
        new Stripe.errors.StripeInvalidRequestError({
          message: 'No payment methods',
          requestId: 'req_example',
        }),
      );
    jest
      .spyOn(service as unknown as { stripe(): Stripe }, 'stripe')
      .mockReturnValue(stripe);
    await expect(
      service.signup(eventId, {
        ticketId: 'ticket',
        name: 'Maria',
        email: 'maria@example.org',
        phone: '912345678',
      }),
    ).rejects.toThrow('vaga foi liberada');
    expect(tx.eventPayment.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: { status: 'FAILED' },
    });
    expect(tx.eventRegistration.update).toHaveBeenCalledWith({
      where: { id: registrationId },
      data: { status: 'CANCELLED', expiresAt: null },
    });
  });
  function payload(amount = 2000) {
    return JSON.stringify({
      id: 'evt_example',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_example',
          metadata: { paymentId },
          client_reference_id: registrationId,
          currency: 'eur',
          amount_total: amount,
          payment_status: 'paid',
          expires_at: Math.floor(expiresAt.getTime() / 1000),
          payment_intent: 'pi_example',
        },
      },
    });
  }
  async function deliver(value: string) {
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: value,
      secret,
    });
    return service.webhook(Buffer.from(value), signature);
  }
  it('rejects an unsigned webhook', async () => {
    await expect(
      service.webhook(Buffer.from(payload()), undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('confirms a signed paid session and ignores repeated delivery', async () => {
    await deliver(payload());
    expect(tx.eventRegistration.update).toHaveBeenCalledWith({
      where: { id: registrationId },
      data: { status: 'REGISTERED', expiresAt: null },
    });
    tx.eventPayment.findUniqueOrThrow.mockResolvedValue({
      status: 'CONFIRMED',
    });
    await deliver(payload());
    expect(tx.eventRegistration.update).toHaveBeenCalledTimes(1);
  });
  it('rejects a signed session with a manipulated amount', async () => {
    await expect(deliver(payload(1))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.eventRegistration.update).not.toHaveBeenCalled();
  });
  it('cancels the reservation when a signed session expires', async () => {
    const value = payload()
      .replace('checkout.session.completed', 'checkout.session.expired')
      .replace('"payment_status":"paid"', '"payment_status":"unpaid"');
    await deliver(value);
    expect(tx.eventRegistration.update).toHaveBeenCalledWith({
      where: { id: registrationId },
      data: { status: 'CANCELLED', expiresAt: null },
    });
  });
  it('refunds a payment after the registration was cancelled instead of reviving it', async () => {
    tx.eventRegistration.findUniqueOrThrow.mockResolvedValue({
      id: registrationId,
      status: 'CANCELLED',
      expiresAt,
    });
    const stripe = new Stripe('sk_test_example');
    const refund = jest.spyOn(stripe.refunds, 'create').mockResolvedValue({
      id: 're_example',
    } as Stripe.Response<Stripe.Refund>);
    jest
      .spyOn(service as unknown as { stripe(): Stripe }, 'stripe')
      .mockReturnValue(stripe);
    await deliver(payload());
    expect(refund).toHaveBeenCalledWith(
      { payment_intent: 'pi_example' },
      { idempotencyKey: `event-unavailable-${paymentId}` },
    );
    expect(tx.eventRegistration.update).not.toHaveBeenCalled();
  });
});
