import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CurrentUser } from '@church/shared';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { PUBLIC_KEY } from './permission.decorator';

export interface AuthRequest extends Request {
  user: CurrentUser;
  sessionId: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '');
    if (!match?.[1]) throw new UnauthorizedException();
    const session = await this.auth.authenticate(match[1]);
    request.user = session.user;
    request.sessionId = session.sessionId;
    return true;
  }
}
