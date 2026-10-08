import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { Permission } from '../auth/permission.decorator';
import type { AuthRequest } from '../auth/auth.guard';
import { PageQuery } from '../members/member.dto';
import { PrismaService } from '../../database/prisma.service';
import { PrivacyService } from './privacy.service';
import {
  AnonymizeDto,
  ConsentDto,
  LegalHoldDto,
  PersonalExportQuery,
  PrivacyRequestDto,
  ResolvePrivacyDto,
  RetentionDto,
} from './privacy.dto';
@ApiTags('Privacidade')
@ApiBearerAuth()
@Controller('privacy')
export class PrivacyController {
  constructor(
    private readonly privacy: PrivacyService,
    private readonly db: PrismaService,
  ) {}
  @Get('me') me(@Req() r: AuthRequest) {
    return this.privacy.me(r.user);
  }
  @Get('me/requests') mine(@Req() r: AuthRequest) {
    return this.privacy.requests(r.user);
  }
  @Post('me/requests') request(
    @Body() dto: PrivacyRequestDto,
    @Req() r: AuthRequest,
  ) {
    return this.privacy.request(dto, r.user);
  }
  @Post('me/consents') consent(@Body() dto: ConsentDto, @Req() r: AuthRequest) {
    return this.privacy.consent(dto, r.user);
  }
  @Get('me/export') async ownExport(
    @Query() q: PersonalExportQuery,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.file(
      await this.privacy.export(await this.privacy.own(r.user), q, r.user),
      res,
    );
  }
  @Get('members/:id/export')
  @Permission('PRIVACY_EXPORT', 'MEMBER_READ')
  async export(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PersonalExportQuery,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.file(await this.privacy.export(id, q, r.user), res);
  }
  @Get('requests')
  @Permission('PRIVACY_MANAGE', 'MEMBER_READ')
  async requests(@Query() q: PageQuery) {
    return {
      items: await this.db.privacyRequest.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      total: await this.db.privacyRequest.count({}),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Patch('requests/:id')
  @Permission('PRIVACY_MANAGE', 'MEMBER_UPDATE')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolvePrivacyDto,
    @Req() r: AuthRequest,
  ) {
    return this.privacy.resolve(id, dto, r.user);
  }
  @Get('retention') @Permission('PRIVACY_MANAGE') policies() {
    return this.privacy.policies();
  }
  @Post('retention') @Permission('PRIVACY_MANAGE') policy(
    @Body() dto: RetentionDto,
    @Req() r: AuthRequest,
  ) {
    return this.privacy.policy(dto, r.user);
  }
  @Patch('members/:id/legal-hold')
  @Permission('PRIVACY_MANAGE', 'MEMBER_UPDATE')
  hold(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LegalHoldDto) {
    return this.privacy.hold(id, dto.legalHold);
  }
  @Post('members/:id/anonymize')
  @Permission('PRIVACY_MANAGE', 'MEMBER_UPDATE', 'FINANCE_CONTRIBUTION_READ')
  anonymize(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnonymizeDto,
    @Req() r: AuthRequest,
  ) {
    return this.privacy.anonymize(id, dto, r.user);
  }
  private file(data: object, res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(Buffer.from(JSON.stringify(data, null, 2)), {
      type: 'application/json',
      disposition: 'attachment; filename="personal-data.json"',
    });
  }
}
