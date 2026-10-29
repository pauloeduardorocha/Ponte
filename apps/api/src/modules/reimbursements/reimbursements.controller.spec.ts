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
  const beginSubmission = jest
    .fn()
    .mockResolvedValue({ id: 'receipt', chunkSize: 262144 });
  const uploadSubmissionChunk = jest.fn().mockResolvedValue({ received: true });
  const finishSubmission = jest.fn().mockResolvedValue({ id: 'receipt' });
  const payload = {
    iban: 'PT50000201231234567890154',
    categoryId: '63b80123-eefa-4f48-a877-6cfdcdd4b724',
    purpose: 'Material',
    amount: '25.10',
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ReimbursementsController],
      providers: [
        {
          provide: ReimbursementsService,
          useValue: {
            create,
            beginSubmission,
            uploadSubmissionChunk,
            finishSubmission,
          },
        },
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
  beforeEach(() => jest.clearAllMocks());

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
  it('accepts the four editable form fields and passes the authenticated author', async () => {
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
  const submissionId = '0ed04fa5-c589-4de3-8568-1fa04602f65a';
  const manifest = [
    {
      name: 'receipt.pdf',
      type: 'application/pdf',
      size: 9,
      sha256: 'a'.repeat(64),
    },
  ];
  it('validates the nested manifest before starting a session', async () => {
    await request(app.getHttpServer())
      .post('/reimbursements/submissions')
      .send({ ...payload, id: submissionId, files: manifest })
      .expect(401);
    await request(app.getHttpServer())
      .post('/reimbursements/submissions')
      .set('Authorization', 'Bearer member')
      .send({ ...payload, id: submissionId, files: manifest })
      .expect(201);
    expect(beginSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ ...payload, files: manifest }),
      user,
    );
    beginSubmission.mockClear();
    for (const files of [
      [],
      Array(4).fill(manifest[0]),
      [{ ...manifest[0], size: 2097153 }],
      [{ ...manifest[0], sha256: 'invalid' }],
      [{ ...manifest[0], userId: 'forged' }],
    ]) {
      await request(app.getHttpServer())
        .post('/reimbursements/submissions')
        .set('Authorization', 'Bearer member')
        .send({ ...payload, id: submissionId, files })
        .expect(400);
    }
    expect(beginSubmission).not.toHaveBeenCalled();
  });
  it('bounds multipart blocks and parses their coordinates', async () => {
    const path = `/reimbursements/submissions/${submissionId}/files/0/chunks/0`;
    await request(app.getHttpServer())
      .post(path)
      .attach('file', Buffer.alloc(9), 'chunk')
      .expect(401);
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer member')
      .attach('file', Buffer.alloc(262145), 'chunk')
      .expect(413);
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer member')
      .attach('file', Buffer.alloc(9), 'chunk')
      .expect(201);
    expect(uploadSubmissionChunk).toHaveBeenCalledTimes(1);
    expect(uploadSubmissionChunk).toHaveBeenCalledWith(
      submissionId,
      0,
      0,
      expect.objectContaining({ size: 9 }),
      user,
    );
    await request(app.getHttpServer())
      .post(`/reimbursements/submissions/${submissionId}/complete`)
      .set('Authorization', 'Bearer member')
      .expect(201);
    expect(finishSubmission).toHaveBeenCalledWith(submissionId, user);
  });
});
