import {
  ApiTags,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiExtraModels,
  getSchemaPath,
  ApiProduces,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/auth.guard';
import { Permission } from '../auth/permission.decorator';
import { PrivateUpload, MAX_ATTACHMENT_SIZE } from '../finance/storage.service';
import {
  BankQuery,
  ClassifyBankDto,
  ImportUploadDto,
  LinkBankDto,
  ReconcileBankDto,
  UndoBankDto,
} from './banking.dto';
import { BankingService } from './banking.service';
@ApiTags('Importacoes bancarias')
@ApiBearerAuth()
@Controller('finance/banking')
@Permission('FINANCE_BANK_IMPORT', 'FINANCE_CONTRIBUTION_READ')
export class BankingController {
  constructor(private readonly banking: BankingService) {}
  @ApiConsumes('multipart/form-data')
  @ApiExtraModels(ImportUploadDto)
  @ApiBody({
    schema: {
      allOf: [
        { $ref: getSchemaPath(ImportUploadDto) },
        {
          type: 'object',
          required: ['file'],
          properties: {
            file: {
              type: 'string',
              format: 'binary',
              description: 'CSV, XLSX ou OFX; limite 10 MB',
            },
          },
        },
      ],
    },
  })
  @Post('imports')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_ATTACHMENT_SIZE, files: 1, fields: 1 },
    }),
  )
  upload(
    @Body() dto: ImportUploadDto,
    @UploadedFile() file: PrivateUpload,
    @Req() req: AuthRequest,
  ) {
    return this.banking.upload(dto.accountId, file, req.user);
  }
  @Get('imports') imports(@Query() q: BankQuery) {
    return this.banking.imports(q);
  }
  @Get('imports/:id') detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.banking.importDetail(id);
  }
  @Post('imports/:id/confirm') confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.banking.confirm(id, req.user);
  }
  @Get('transactions') movements(
    @Query() q: BankQuery,
    @Req() req: AuthRequest,
  ) {
    return this.banking.movements(q, req.user);
  }
  @Get('members') members(@Query() q: BankQuery) {
    return this.banking.members(q);
  }
  @Get('transactions/:id/suggestions') suggestions(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.banking.suggestions(id);
  }
  @Post('classify') classify(
    @Body() dto: ClassifyBankDto,
    @Req() req: AuthRequest,
  ) {
    return this.banking.classify(dto, req.user);
  }
  @Post('reconcile')
  @Permission('FINANCE_RECONCILE', 'FINANCE_CONTRIBUTION_READ')
  reconcile(@Body() dto: ReconcileBankDto, @Req() req: AuthRequest) {
    return this.banking.reconcile(dto, req.user);
  }
  @Post('transactions/:id/link')
  @Permission('FINANCE_RECONCILE', 'FINANCE_CONTRIBUTION_READ')
  linkExisting(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkBankDto,
    @Req() req: AuthRequest,
  ) {
    return this.banking.linkExisting(id, dto, req.user);
  }
  @Post('undo')
  @Permission('FINANCE_RECONCILE', 'FINANCE_CONTRIBUTION_READ')
  undo(@Body() dto: UndoBankDto, @Req() req: AuthRequest) {
    return this.banking.undo(dto, req.user);
  }
  @ApiProduces('application/octet-stream')
  @Get('imports/:id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.banking.download(id, req.user);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.buffer, {
      type: 'application/octet-stream',
      disposition:
        "attachment; filename*=UTF-8''" + encodeURIComponent(file.filename),
    });
  }
}
