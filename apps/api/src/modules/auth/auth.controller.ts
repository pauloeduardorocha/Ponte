import { ApiTags, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService, REFRESH_TTL_MS } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto';
import { AuthRequest } from './auth.guard';
import { Public } from './permission.decorator';

@ApiTags('Autenticacao')
@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  private readonly cookieOptions: CookieOptions;
  private readonly origins: string[];
  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.cookieOptions = {
      httpOnly: true,
      secure: config.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
    };
    this.origins = (config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  private cookie(req: Request) {
    if (req.headers.origin && !this.origins.includes(req.headers.origin))
      throw new ForbiddenException('Origem inválida');
    const token = req.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('refresh_token='))
      ?.slice('refresh_token='.length);
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
  }

  private reply(
    res: Response,
    result: Awaited<ReturnType<AuthService['login']>>,
  ) {
    res.cookie('refresh_token', result.refreshToken, {
      ...this.cookieOptions,
      maxAge: REFRESH_TTL_MS,
    });
    res.setHeader('Cache-Control', 'no-store');
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.cookie(req);
    return this.reply(res, await this.auth.login(dto.email, dto.password));
  }

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @ApiCookieAuth('refresh_token')
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.cookie(req);
    if (!token) throw new UnauthorizedException('Refresh token ausente');
    return this.reply(res, await this.auth.refresh(token));
  }

  @Public()
  @ApiCookieAuth('refresh_token')
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(this.cookie(req));
    res.clearCookie('refresh_token', this.cookieOptions);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return req.user;
  }

  @ApiBearerAuth()
  @Patch('password')
  @HttpCode(204)
  async password(
    @Req() req: AuthRequest,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(req.user.id, dto);
    res.clearCookie('refresh_token', this.cookieOptions);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }
}
