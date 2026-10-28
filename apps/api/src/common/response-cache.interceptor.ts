import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { responseCacheTtl } from '@church/shared';
import type { Request, Response } from 'express';
import { tap } from 'rxjs';

@Injectable()
export class ResponseCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    return next.handle().pipe(
      tap(() => {
        const ttl =
          req.method === 'GET' ? responseCacheTtl(req.originalUrl) : 0;
        if (
          ttl &&
          res.statusCode >= 200 &&
          res.statusCode < 300 &&
          !res.headersSent
        ) {
          res.setHeader('Cache-Control', `private, max-age=${ttl}`);
          res.vary('Authorization');
          res.vary('Cookie');
        }
      }),
    );
  }
}
