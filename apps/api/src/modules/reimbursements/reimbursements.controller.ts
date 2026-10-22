import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Delete,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Permission } from '../auth/permission.decorator';
import type { AuthRequest } from '../auth/auth.guard';
import { StorageService, PrivateUpload } from '../finance/storage.service';
import { ReimbursementsService } from './reimbursements.service';
import {
  LinkReimbursementDto,
  PaymentDto,
  ReimbursementDto,
  ReimbursementFileDto,
  ReimbursementQuery,
} from './reimbursements.dto';

const limits = { fileSize: 2 * 1024 * 1024, files: 3, fields: 5 };
@Controller('reimbursements')
export class ReimbursementsController {
  constructor(private readonly service: ReimbursementsService) {}
  @Post()
  @UseInterceptors(FilesInterceptor('files', 3, { limits }))
  create(
    @Body() dto: ReimbursementDto,
    @UploadedFiles() files: PrivateUpload[],
    @Req() req: AuthRequest,
  ) {
    return this.service.create(dto, files, req.user);
  }
  @Get()
  @Permission('FINANCE_TRANSACTION_READ', 'FINANCE_TRANSACTION_UPDATE')
  list(@Query() q: ReimbursementQuery, @Req() req: AuthRequest) {
    return this.service.list(q, req.user);
  }
  @Get('categories')
  categories(@Req() req: AuthRequest) {
    return this.service.categories(req.user);
  }
  @Get('profile')
  profile(@Req() req: AuthRequest) {
    return this.service.profile(req.user);
  }
  @Get('mine')
  mine(@Query() q: ReimbursementQuery, @Req() req: AuthRequest) {
    return this.service.list(q, req.user, true);
  }
  @Get('movement/:id')
  @Permission('FINANCE_BANK_IMPORT', 'FINANCE_CONTRIBUTION_READ')
  movement(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.forMovement(id);
  }
  @Get('movement/:id/suggestions')
  @Permission(
    'FINANCE_RECONCILE',
    'FINANCE_TRANSACTION_READ',
    'FINANCE_TRANSACTION_UPDATE',
  )
  movementSuggestions(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.movementSuggestions(id);
  }
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.detail(id, req.user);
  }
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReimbursementDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, dto, req.user);
  }
  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 1 },
    }),
  )
  attach(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReimbursementFileDto,
    @UploadedFile() file: PrivateUpload,
    @Req() req: AuthRequest,
  ) {
    return this.service.attach(id, file, dto.kind ?? 'DOCUMENT', req.user);
  }
  @Get(':id/attachments/:fileId/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.service.download(id, fileId, req.user);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.buffer, {
      type: file.mime,
      disposition:
        "attachment; filename*=UTF-8''" + encodeURIComponent(file.filename),
    });
  }
  @Post(':id/payment')
  @Permission('FINANCE_TRANSACTION_READ', 'FINANCE_TRANSACTION_UPDATE')
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.pay(id, dto.paidAt, req.user);
  }
  @Delete(':id/payment')
  @Permission('FINANCE_TRANSACTION_READ', 'FINANCE_TRANSACTION_UPDATE')
  undoPayment(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.undoPayment(id, req.user);
  }
  @Get(':id/suggestions')
  @Permission(
    'FINANCE_RECONCILE',
    'FINANCE_TRANSACTION_READ',
    'FINANCE_TRANSACTION_UPDATE',
  )
  suggestions(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.suggestions(id);
  }
  @Post(':id/link')
  @Permission(
    'FINANCE_RECONCILE',
    'FINANCE_TRANSACTION_READ',
    'FINANCE_TRANSACTION_UPDATE',
  )
  link(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkReimbursementDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.link(id, dto.transactionId, req.user);
  }
  @Delete(':id/link')
  @Permission(
    'FINANCE_RECONCILE',
    'FINANCE_TRANSACTION_READ',
    'FINANCE_TRANSACTION_UPDATE',
  )
  unlink(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.unlink(id, req.user);
  }
}
@Module({
  controllers: [ReimbursementsController],
  providers: [ReimbursementsService, StorageService],
})
export class ReimbursementsModule {}
