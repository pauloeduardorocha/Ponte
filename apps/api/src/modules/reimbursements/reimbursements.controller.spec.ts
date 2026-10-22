import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { ReimbursementsController } from './reimbursements.controller';
import { ReimbursementsService } from './reimbursements.service';

describe('Reimbursement submission HTTP contract', () => {
  let app: INestApplication;
  const user = { id: 'member', permissions: [] };
  const create = jest.fn().mockResolvedValue({ id: 'receipt' });
  const payload = {
    beneficiaryName: 'Maria',
    iban: 'PT50000201231234567890154',
    categoryId: '63b80123-eefa-4f48-a877-6cfdcdd4b724',
    purpose: 'Material',
    amount: '25.10',
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ReimbursementsController],
      providers: [
        { provide: ReimbursementsService, useValue: { create } },
        {
          provide: AuthService,
          useValue: {
            authenticate: async () => ({ user, sessionId: 'session' }),
          },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => create.mockClear());

  it('requires authentication before accepting an upload', async () => {
    await request(app.getHttpServer()).post('/reimbursements').expect(401);
    expect(create).not.toHaveBeenCalled();
  });
  it('removes the anonymous submission endpoint', async () => {
    await request(app.getHttpServer())
      .post('/reimbursements/public')
      .expect(404);
    expect(create).not.toHaveBeenCalled();
  });
  it.each(['iban', 'categoryId', 'amount'] as const)(
    'rejects a missing %s',
    async (field) => {
      const body: Record<string, string> = { ...payload };
      delete body[field];
      await request(app.getHttpServer())
        .post('/reimbursements')
        .set('Authorization', 'Bearer member')
        .send(body)
        .expect(400);
      expect(create).not.toHaveBeenCalled();
    },
  );
  it.each(['', null, '0', '0.00', '-1', '1.234', 'abc'])(
    'rejects invalid amount %p',
    async (amount) => {
      await request(app.getHttpServer())
        .post('/reimbursements')
        .set('Authorization', 'Bearer member')
        .send({ ...payload, amount })
        .expect(400);
      expect(create).not.toHaveBeenCalled();
    },
  );
  it('accepts all five form fields and passes the authenticated author', async () => {
    let upload = request(app.getHttpServer())
      .post('/reimbursements')
      .set('Authorization', 'Bearer member');
    for (const [key, value] of Object.entries(payload))
      upload = upload.field(key, value);
    await upload
      .attach('files', Buffer.from('%PDF-test'), 'receipt.pdf')
      .expect(201, { id: 'receipt' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining(payload),
      expect.arrayContaining([
        expect.objectContaining({ originalname: 'receipt.pdf' }),
      ]),
      user,
    );
  });
});
