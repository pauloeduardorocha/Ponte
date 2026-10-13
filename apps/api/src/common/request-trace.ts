import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export const requestTrace = new AsyncLocalStorage<{
  requestId: string;
  startedAt: number;
  stage?: string;
}>();

export function traceMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);
  requestTrace.run({ requestId, startedAt: performance.now() }, next);
}

// Never include exception messages, stacks, SQL, metadata or uploaded content.
export function safeErrorFields(error: unknown) {
  const value = error as { name?: unknown; code?: unknown } | null;
  const allowedNames = new Set([
    'Error',
    'TypeError',
    'RangeError',
    'SyntaxError',
    'PrismaClientKnownRequestError',
    'PrismaClientUnknownRequestError',
    'PrismaClientInitializationError',
    'PrismaClientValidationError',
    'BadRequestException',
    'ConflictException',
    'NotFoundException',
  ]);
  const code =
    typeof value?.code === 'string' &&
    /^(P\d{4}|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|ENOSPC)$/.test(value.code)
      ? value.code
      : undefined;
  return {
    errorType:
      typeof value?.name === 'string' && allowedNames.has(value.name)
        ? value.name
        : 'UnknownError',
    errorCode: code,
  };
}
