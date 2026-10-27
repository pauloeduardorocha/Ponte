import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/permission.decorator';
import { CreateFrontendErrorDto } from './frontend-errors.dto';
import { FrontendErrorsService } from './frontend-errors.service';
import { frontendErrorNetwork } from './frontend-error-network';

@Controller('client-errors')
export class FrontendErrorsController {
  constructor(
    private readonly service: FrontendErrorsService,
    private readonly auth: AuthService,
  ) {}

  @Post()
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(
    @Body() dto: CreateFrontendErrorDto,
    @Headers('authorization') authorization: string | undefined,
    @Req() request: Request,
  ) {
    let userId: string | undefined;
    const token = /^Bearer\s+([^\s]+)$/i.exec(authorization ?? '')?.[1];
    if (token) {
      try {
        userId = (await this.auth.authenticate(token)).user.id;
      } catch {
        /* keep report anonymous when the session expired */
      }
    }
    if (!dto.userAgent && request.headers['user-agent'])
      dto.userAgent = request.headers['user-agent'].slice(0, 1024);
    const vercel =
      process.env.VERCEL === '1' &&
      (process.env.VERCEL_ENV === 'production' ||
        process.env.VERCEL_ENV === 'preview');
    return this.service.create(
      dto,
      userId,
      frontendErrorNetwork(request, vercel),
    );
  }
}
