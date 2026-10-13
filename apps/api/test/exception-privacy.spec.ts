import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { SafeExceptionFilter } from '../src/common/safe-exception.filter';
import { requestTrace, traceMiddleware } from '../src/common/request-trace';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
describe('Exception privacy', () => {
  it('correlates a database timeout with the response without leaking SQL or metadata', () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const json = jest.fn();
    const headers: Record<string, string> = {};
    const response = {
      setHeader: (key: string, value: string) => {
        headers[key] = value;
      },
      status: jest.fn().mockReturnValue({ json }),
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    try {
      traceMiddleware({} as Request, response as unknown as Response, () => {
        requestTrace.getStore()!.stage = 'bank_import.persist_movements';
        new SafeExceptionFilter().catch(
          new Prisma.PrismaClientKnownRequestError(
            'SQL contains secret bank details',
            {
              code: 'P2028',
              clientVersion: 'test',
              meta: { account: 'private' },
            },
          ),
          host,
        );
      });
      const logged = JSON.parse(log.mock.calls[0]![0] as string);
      expect(logged).toMatchObject({
        requestId: headers['X-Request-Id'],
        errorCode: 'P2028',
        stage: 'bank_import.persist_movements',
        durationMs: expect.any(Number),
      });
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: logged.requestId }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|private|SQL/);
    } finally {
      log.mockRestore();
    }
  });
  it('keeps database parameters and personal data out of responses and operational logs', () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const json = jest.fn();
    const response = { status: jest.fn().mockReturnValue({ json }) };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    try {
      new SafeExceptionFilter().catch(
        new Error('password=secret; member=private; amount=100.00'),
        host,
      );
      expect(response.status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: expect.any(String) }),
      );
      expect(JSON.stringify([log.mock.calls, json.mock.calls])).not.toMatch(
        /secret|private|100\.00/,
      );
    } finally {
      log.mockRestore();
    }
  });
  it('preserves safe validation responses', () => {
    const json = jest.fn();
    const response = { status: jest.fn().mockReturnValue({ json }) };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    new SafeExceptionFilter().catch(
      new BadRequestException('Invalid MIME'),
      host,
    );
    expect(response.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid MIME' }),
    );
  });
});
