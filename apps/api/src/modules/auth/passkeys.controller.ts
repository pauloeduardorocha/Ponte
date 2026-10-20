import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Request, Response } from 'express';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { AuthRequest } from './auth.guard';
import { Public } from './permission.decorator';
import { PasskeysService } from './passkeys.service';
import { REFRESH_TTL_MS } from './auth.service';

export class PasskeyOptionsDto {
  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
export class PasskeyVerifyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  challengeId!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  response!: AuthenticationResponseJSON;
}
export class PasskeyRegisterDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  challengeId!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  response!: RegistrationResponseJSON;
  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

@ApiTags('Autenticacao')
@Controller('auth/passkeys')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class PasskeysController {
  constructor(
    private readonly passkeys: PasskeysService,
    private readonly config: ConfigService,
  ) {}

  @ApiBearerAuth()
  @Get()
  list(@Req() req: AuthRequest) {
    return this.passkeys.list(req.user.id);
  }

  @ApiBearerAuth()
  @Post('register/options')
  @HttpCode(200)
  options(@Req() req: AuthRequest, @Body() dto: PasskeyOptionsDto) {
    return this.passkeys.registrationOptions(
      req.user.id,
      dto.password,
      this.passkeys.origin(req.headers.origin),
    );
  }

  @ApiBearerAuth()
  @Post('register/verify')
  @HttpCode(200)
  register(@Req() req: AuthRequest, @Body() dto: PasskeyRegisterDto) {
    return this.passkeys.register(
      req.user.id,
      dto.challengeId,
      dto.response,
      dto.name,
      this.passkeys.origin(req.headers.origin),
    );
  }

  @Public()
  @Post('login/options')
  @HttpCode(200)
  loginOptions(@Req() req: Request) {
    return this.passkeys.authenticationOptions(
      this.passkeys.origin(req.headers.origin),
    );
  }

  @Public()
  @Post('login/verify')
  @HttpCode(200)
  async login(
    @Req() req: Request,
    @Body() dto: PasskeyVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.passkeys.login(
      dto.challengeId,
      dto.response,
      this.passkeys.origin(req.headers.origin),
    );
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: REFRESH_TTL_MS,
    });
    res.setHeader('Cache-Control', 'no-store');
    return { accessToken: result.accessToken, user: result.user };
  }

  @ApiBearerAuth()
  @Delete(':id')
  @HttpCode(204)
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    this.passkeys.origin(req.headers.origin);
    return this.passkeys.remove(req.user.id, id);
  }
}
