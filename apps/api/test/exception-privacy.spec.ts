import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { SafeExceptionFilter } from '../src/common/safe-exception.filter';
describe('Exception privacy', () => {
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
