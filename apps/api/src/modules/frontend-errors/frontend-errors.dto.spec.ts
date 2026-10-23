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

  it('accepts a versioned report with the production whitelist', async () => {
    const dto = plainToInstance(CreateFrontendErrorDto, {
      ...valid, device: { ...valid.device, appVersion: '0.1.1' },
    });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
    expect(dto.device?.appVersion).toBe('0.1.1');
  });

  it.each(['invalid', 42, '1.2.3<script>', '1'.repeat(33)])('rejects invalid appVersion %p', async (appVersion) => {
    const dto = plainToInstance(CreateFrontendErrorDto, {
      ...valid, device: { ...valid.device, appVersion },
    });
    expect(await validate(dto)).not.toHaveLength(0);
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
