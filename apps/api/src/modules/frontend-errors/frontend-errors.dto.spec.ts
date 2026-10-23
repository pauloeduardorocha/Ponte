import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFrontendErrorDto } from './frontend-errors.dto';

describe('CreateFrontendErrorDto', () => {
  const valid = {
    occurredAt: '2026-10-23T16:00:00.000Z',
    eventType: 'api',
    message: 'HTTP 503',
    route: '/reimbursements/new',
    apiPath: '/api/v1/reimbursements',
    apiMethod: 'POST',
    apiStatus: 503,
    device: { os: 'Android', browser: 'Chrome', online: true },
    logs: [{ level: 'warn', at: '2026-10-23T15:59:00.000Z', message: 'retry' }],
  };

  it('accepts bounded device and log context', async () => {
    expect(await validate(plainToInstance(CreateFrontendErrorDto, valid))).toHaveLength(0);
  });

  it('rejects unknown fields, invalid types and oversized logs', async () => {
    const invalid = plainToInstance(CreateFrontendErrorDto, {
      ...valid,
      userId: 'attacker-controlled',
      apiStatus: 700,
      logs: Array.from({ length: 21 }, () => ({ level: 'error', message: 'x' })),
    });
    expect(await validate(invalid, { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
  });
});
