import {
  ApiTags,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiProduces,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { Permission } from '../auth/permission.decorator';
import type { AuthRequest } from '../auth/auth.guard';
import { FinanceService } from './finance.service';
import { MAX_ATTACHMENT_SIZE, PrivateUpload } from './storage.service';
import {
  AccountDto,
  DashboardQuery,
  AccountPatch,
  CategoryDto,
  CategoryPatch,
  SupplierDto,
  SupplierPatch,
  IncomeDto,
  IncomePatch,
  ExpenseDto,
  ExpensePatch,
  ContributionDto,
  ContributionPatch,
  FinanceQuery,
} from './finance.dto';
@ApiTags('Financeiro')
@ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('members')
  @Permission('FINANCE_CONTRIBUTION_READ')
  members(@Query() q: FinanceQuery) {
    return this.finance.members(q);
  }

  @Get('categories')
  @Permission('FINANCE_CATEGORY_READ')
  categories(@Query() q: FinanceQuery) {
    return this.finance.categories(q);
  }
  @Post('categories')
  @Permission('FINANCE_CATEGORY_WRITE')
  createCategory(@Body() dto: CategoryDto, @Req() req: AuthRequest) {
    return this.finance.saveCategory(dto, req.user);
  }
  @Patch('categories/:id')
  @Permission('FINANCE_CATEGORY_WRITE')
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CategoryPatch,
    @Req() req: AuthRequest,
  ) {
    return this.finance.saveCategory(dto, req.user, id);
  }

  @Get('accounts')
  @Permission('FINANCE_ACCOUNT_READ')
  accounts(@Query() q: FinanceQuery) {
    return this.finance.accounts(q);
  }
  @Post('accounts')
  @Permission('FINANCE_ACCOUNT_WRITE')
  createAccount(@Body() dto: AccountDto, @Req() req: AuthRequest) {
    return this.finance.saveAccount(dto, req.user);
  }
  @Patch('accounts/:id')
  @Permission('FINANCE_ACCOUNT_WRITE')
  updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccountPatch,
    @Req() req: AuthRequest,
  ) {
    return this.finance.saveAccount(dto, req.user, id);
  }

  @Delete('accounts/:id')
  @Permission('FINANCE_ACCOUNT_WRITE')
  deleteAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.finance.deleteAccount(id, req.user);
  }
  @Get('suppliers')
  @Permission('FINANCE_SUPPLIER_READ')
  suppliers(@Query() q: FinanceQuery) {
    return this.finance.suppliers(q);
  }
  @Post('suppliers')
  @Permission('FINANCE_SUPPLIER_WRITE')
  createSupplier(@Body() dto: SupplierDto, @Req() req: AuthRequest) {
    return this.finance.saveSupplier(dto, req.user);
  }
  @Patch('suppliers/:id')
  @Permission('FINANCE_SUPPLIER_WRITE')
  updateSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupplierPatch,
    @Req() req: AuthRequest,
  ) {
    return this.finance.saveSupplier(dto, req.user, id);
  }

  @Get('incomes')
  @Permission('FINANCE_TRANSACTION_READ')
  incomes(@Query() q: FinanceQuery, @Req() req: AuthRequest) {
    return this.finance.incomes(q, req.user);
  }
  @Post('incomes')
  @Permission('FINANCE_TRANSACTION_CREATE')
  createIncome(@Body() dto: IncomeDto, @Req() req: AuthRequest) {
    return this.finance.saveIncome(dto, req.user);
  }
  @Patch('incomes/:id')
  @Permission('FINANCE_TRANSACTION_UPDATE')
  updateIncome(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IncomePatch,
    @Req() req: AuthRequest,
  ) {
    return this.finance.saveIncome(dto, req.user, id);
  }

  @Get('expenses')
  @Permission('FINANCE_TRANSACTION_READ')
  expenses(@Query() q: FinanceQuery) {
    return this.finance.expenses(q);
  }
  @Post('expenses')
  @Permission('FINANCE_TRANSACTION_CREATE')
  createExpense(@Body() dto: ExpenseDto, @Req() req: AuthRequest) {
    return this.finance.saveExpense(dto, req.user);
  }
  @Patch('expenses/:id')
  @Permission('FINANCE_TRANSACTION_UPDATE')
  updateExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExpensePatch,
    @Req() req: AuthRequest,
  ) {
    return this.finance.saveExpense(dto, req.user, id);
  }

  @Get('contributions')
  @Permission('FINANCE_CONTRIBUTION_READ')
  contributions(@Query() q: FinanceQuery) {
    return this.finance.contributions(q);
  }
  @Post('contributions')
  @Permission('FINANCE_CONTRIBUTION_WRITE', 'FINANCE_CONTRIBUTION_READ')
  createContribution(@Body() dto: ContributionDto, @Req() req: AuthRequest) {
    return this.finance.saveContribution(dto, req.user);
  }
  @Patch('contributions/:id')
  @Permission('FINANCE_CONTRIBUTION_WRITE', 'FINANCE_CONTRIBUTION_READ')
  updateContribution(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContributionPatch,
    @Req() req: AuthRequest,
  ) {
    return this.finance.saveContribution(dto, req.user, id);
  }

  @Get('dashboard')
  @Permission('FINANCE_DASHBOARD_READ')
  dashboard(@Req() req: AuthRequest, @Query() query: DashboardQuery) {
    return this.finance.dashboard(req.user, query);
  }
  @Get('expenses/:id/attachments')
  @Permission('FINANCE_ATTACHMENT_READ')
  attachments(@Param('id', ParseUUIDPipe) id: string) {
    return this.finance.attachments(id);
  }
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF, JPEG ou PNG; limite 10 MB',
        },
      },
    },
  })
  @Post('expenses/:id/attachments')
  @Permission('FINANCE_ATTACHMENT_WRITE')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_ATTACHMENT_SIZE, files: 1, fields: 0 },
    }),
  )
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: PrivateUpload,
    @Req() req: AuthRequest,
  ) {
    return this.finance.upload(id, file, req.user);
  }
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @Get('attachments/:id/download')
  @Permission('FINANCE_ATTACHMENT_READ')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.finance.download(id, req.user);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.buffer, {
      type: file.mime,
      disposition:
        "attachment; filename*=UTF-8''" + encodeURIComponent(file.filename),
    });
  }
}
