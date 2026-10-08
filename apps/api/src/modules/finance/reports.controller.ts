import { ApiTags, ApiBearerAuth, ApiProduces } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { Permission } from '../auth/permission.decorator';
import type { AuthRequest } from '../auth/auth.guard';
import { ReportsService } from './reports.service';
import {
  ReportQuery,
  ReportExportQuery,
  ReportLookupQuery,
} from './reports.dto';
@ApiTags('Financeiro')
@ApiBearerAuth()
@Controller('finance/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('lookups')
  @Permission('FINANCE_TRANSACTION_READ')
  lookups(@Query() q: ReportLookupQuery, @Req() req: AuthRequest) {
    return this.reports.lookups(q, req.user);
  }
  @Get()
  @Permission('FINANCE_TRANSACTION_READ')
  generate(@Query() q: ReportQuery, @Req() req: AuthRequest) {
    return this.reports.generate(q, req.user);
  }
  @ApiProduces(
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @Get('export')
  @Permission('FINANCE_TRANSACTION_READ')
  async export(
    @Query() q: ReportExportQuery,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.reports.export(q, req.user);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.buffer, {
      type: file.mime,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }
}
