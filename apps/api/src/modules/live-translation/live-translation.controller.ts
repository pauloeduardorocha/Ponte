import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Headers,
  Injectable,
  Module,
  Post,
  ServiceUnavailableException,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { AuthRequest } from '../auth/auth.guard';
import { Public } from '../auth/permission.decorator';
import { DatabaseModule } from '../../database/database.module';
import { LiveTranslationService } from './live-translation.service';
import {
  PublishTranslationDto,
  TranslationSessionDto,
} from './live-translation.dto';

@Injectable()
export class TranslationAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const { user } = context.switchToHttp().getRequest<AuthRequest>();
    if (
      !user?.roles?.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN')
    )
      throw new ForbiddenException();
    return true;
  }
}
@Controller('live-translation')
export class LiveTranslationController {
  constructor(
    private readonly service: LiveTranslationService,
    private readonly config: ConfigService,
  ) {}
  @Get('status') @Throttle({ default: { limit: 600, ttl: 60000 } }) status() {
    return this.service.status();
  }
  @Public()
  @Get('public-status')
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  publicStatus() {
    return this.service.status();
  }
  @Post('credential')
  @UseGuards(TranslationAdminGuard)
  credential() {
    return this.service.rotateCredential();
  }
  @Public()
  @Post('publish')
  publish(
    @Body() dto: PublishTranslationDto,
    @Headers('authorization') auth?: string,
  ) {
    return this.service.publish(dto, auth);
  }
  @Public()
  @Post('unpublish')
  unpublish(
    @Body() dto: TranslationSessionDto,
    @Headers('authorization') auth?: string,
  ) {
    return this.service.unpublish(dto.sessionId, auth);
  }
  private downloadUrl() {
    const value = this.config.get<string>('TRANSLATION_APP_DOWNLOAD_URL');
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password
        ? url.href
        : null;
    } catch {
      return null;
    }
  }
  private archivePath() {
    const configured = this.config.get<string>('TRANSLATION_APP_ARCHIVE');
    if (configured) return resolve(configured);
    const candidates = [
      'private-storage/translation/Ponte-Traducao-Windows.zip',
      '../../private-storage/translation/Ponte-Traducao-Windows.zip',
    ].map((value) => resolve(value));
    return candidates.find((value) => existsSync(value)) ?? candidates[0]!;
  }
  @Get('download')
  @UseGuards(TranslationAdminGuard)
  download() {
    return {
      url: this.downloadUrl(),
      localAvailable:
        this.config.get('NODE_ENV') !== 'production' &&
        existsSync(this.archivePath()),
    };
  }
  @Get('download/archive')
  @UseGuards(TranslationAdminGuard)
  archive() {
    if (
      this.config.get('NODE_ENV') === 'production' ||
      !existsSync(this.archivePath())
    )
      throw new ServiceUnavailableException(
        'Configure o endereço de download da versão Windows.',
      );
    return new StreamableFile(createReadStream(this.archivePath()), {
      type: 'application/zip',
      disposition: 'attachment; filename="Ponte-Traducao-Windows.zip"',
    });
  }
}
@Module({
  imports: [DatabaseModule],
  controllers: [LiveTranslationController],
  providers: [LiveTranslationService, TranslationAdminGuard],
})
export class LiveTranslationModule {}
