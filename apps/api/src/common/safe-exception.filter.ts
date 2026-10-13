import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { requestTrace, safeErrorFields } from './request-trace';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException && error.getStatus() < 500) {
      const body = error.getResponse();
      response
        .status(error.getStatus())
        .json(
          typeof body === 'string'
            ? { statusCode: error.getStatus(), message: body }
            : body,
        );
      return;
    }
    const trace = requestTrace.getStore();
    const requestId = trace?.requestId ?? randomUUID();
    // Database exceptions can contain complete sensitive rows and SQL parameters.
    const statusCode = error instanceof HttpException ? error.getStatus() : 500;
    this.logger.error(
      JSON.stringify({
        event: 'request.failed',
        requestId,
        statusCode,
        stage: trace?.stage,
        durationMs: trace
          ? Math.round(performance.now() - trace.startedAt)
          : undefined,
        ...safeErrorFields(error),
      }),
    );
    response.status(statusCode).json({
      statusCode,
      message: 'Erro interno no servidor',
      requestId,
    });
  }
}
