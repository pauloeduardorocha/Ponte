import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Body,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { CurrentUser } from '@church/shared';
import { Permission } from '../auth/permission.decorator';
import { PrivateUpload } from '../finance/storage.service';
import {
  InvoiceAssociationDto,
  InvoiceQuery,
  FetchInvoicesDto,
} from './invoices.dto';
import { InvoicesService } from './invoices.service';
import { EfaturaService } from './efatura.service';
type AuthRequest = Request & { user: CurrentUser };
@ApiTags('Faturas e-fatura')
@ApiBearerAuth()
@Controller('finance/invoices')
@Permission('FINANCE_INVOICE_READ')
export class InvoicesController {
  constructor(
    private readonly service: InvoicesService,
    private readonly efatura: EfaturaService,
  ) {}
  @Post('fetch')
  @Permission(
    'FINANCE_INVOICE_READ',
    'FINANCE_INVOICE_IMPORT',
    'FINANCE_BANK_IMPORT',
    'FINANCE_CONTRIBUTION_READ',
  )
  fetch(@Body() dto: FetchInvoicesDto, @Req() req: AuthRequest) {
    return this.efatura.fetch(dto, req.user);
  }
  @Get() list(@Query() q: InvoiceQuery) {
    return this.service.list(q);
  }
  @Post('imports')
  @Permission('FINANCE_INVOICE_READ', 'FINANCE_INVOICE_IMPORT')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  upload(@UploadedFile() file: PrivateUpload, @Req() req: AuthRequest) {
    return this.service.upload(file, req.user);
  }
  @Get('suggestions/:transactionId')
  @Permission(
    'FINANCE_INVOICE_READ',
    'FINANCE_BANK_IMPORT',
    'FINANCE_CONTRIBUTION_READ',
  )
  suggestions(@Param('transactionId', ParseUUIDPipe) id: string) {
    return this.service.suggestions(id);
  }
  @Post(':id/association')
  @Permission(
    'FINANCE_INVOICE_READ',
    'FINANCE_INVOICE_ASSOCIATE',
    'FINANCE_BANK_IMPORT',
    'FINANCE_CONTRIBUTION_READ',
  )
  associate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InvoiceAssociationDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.associate(id, dto.transactionId, req.user);
  }
  @Delete(':id/association')
  @Permission(
    'FINANCE_INVOICE_READ',
    'FINANCE_INVOICE_ASSOCIATE',
    'FINANCE_BANK_IMPORT',
    'FINANCE_CONTRIBUTION_READ',
  )
  unlink(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.associate(id, null, req.user);
  }
  @Get('imports/:id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.service.original(id, req.user);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.buffer, {
      type: 'application/octet-stream',
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    });
  }
}
