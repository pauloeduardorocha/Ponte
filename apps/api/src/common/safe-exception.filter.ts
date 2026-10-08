import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
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
    const requestId = randomUUID();
    // Database exceptions can contain complete sensitive rows and SQL parameters.
    this.logger.error(`Request failed; reference=${requestId}`);
    response.status(500).json({
      statusCode: 500,
      message: 'Erro interno no servidor',
      requestId,
    });
  }
}
