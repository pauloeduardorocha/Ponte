import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { AuthRequest } from '../auth/auth.guard';
import { Permission } from '../auth/permission.decorator';
import {
  AdjustmentDto,
  BookDto,
  BookQuery,
  CloseLoanDto,
  CopyDto,
  CopyQuery,
  LibraryQuery,
  LoanDto,
  LoanQuery,
  PaymentDto,
  ReservationDto,
  SettingsDto,
  UpdateBookDto,
  UpdateCopyDto,
} from './library.dto';
import { LibraryService } from './library.service';

@Controller('library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get('books')
  @Permission('LIBRARY_BOOK_READ')
  books(@Query() query: BookQuery) {
    return this.library.listBooks(query);
  }

  @Get('books/:id')
  @Permission('LIBRARY_BOOK_READ')
  book(@Param('id', ParseUUIDPipe) id: string) {
    return this.library.getBook(id);
  }

  @Post('books')
  @Permission('LIBRARY_BOOK_CREATE')
  createBook(@Body() dto: BookDto, @Req() req: AuthRequest) {
    return this.library.createBook(dto, req.user.id);
  }

  @Patch('books/:id')
  @Permission('LIBRARY_BOOK_UPDATE')
  updateBook(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookDto,
    @Req() req: AuthRequest,
  ) {
    return this.library.updateBook(id, dto, req.user.id);
  }

  @Delete('books/:id')
  @HttpCode(204)
  @Permission('LIBRARY_BOOK_DELETE')
  deleteBook(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.library.deleteBook(id, req.user.id);
  }

  @Get('copies')
  @Permission('LIBRARY_COPY_READ')
  copies(@Query() query: CopyQuery) {
    return this.library.listCopies(query);
  }

  @Get('copies/:id/history')
  @Permission('LIBRARY_COPY_READ', 'LIBRARY_HISTORY_READ')
  copyHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.library.copyHistory(id);
  }

  @Post('books/:id/copies')
  @Permission('LIBRARY_COPY_CREATE')
  createCopy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CopyDto,
    @Req() req: AuthRequest,
  ) {
    return this.library.createCopy(id, dto, req.user.id);
  }

  @Patch('copies/:id')
  @Permission('LIBRARY_COPY_UPDATE')
  updateCopy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCopyDto,
    @Req() req: AuthRequest,
  ) {
    return this.library.updateCopy(id, dto, req.user.id);
  }

  @Get('loans')
  @Permission('LIBRARY_LOAN_READ')
  loans(@Query() query: LoanQuery) {
    return this.library.listLoans(query);
  }

  @Post('loans')
  @Permission('LIBRARY_LOAN_CREATE')
  borrow(@Body() dto: LoanDto, @Req() req: AuthRequest) {
    return this.library.borrow(dto, req.user.id);
  }

  @Post('loans/:id/return')
  @Permission('LIBRARY_LOAN_RETURN')
  returnLoan(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.library.returnLoan(id, req.user.id);
  }

  @Post('loans/:id/renew')
  @Permission('LIBRARY_LOAN_RENEW')
  renew(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.library.renew(id, req.user.id);
  }

  @Post('loans/:id/close')
  @Permission('LIBRARY_LOAN_RETURN')
  closeLoan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseLoanDto,
    @Req() req: AuthRequest,
  ) {
    return this.library.closeLoan(id, dto, req.user.id);
  }

  @Get('members/:id/history')
  @Permission('LIBRARY_HISTORY_READ')
  memberHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.library.memberHistory(id);
  }

  @Get('members')
  @Permission('LIBRARY_HISTORY_READ')
  members(@Query() query: LibraryQuery) {
    return this.library.members(query);
  }

  @Get('reservations')
  @Permission('LIBRARY_RESERVATION_READ')
  reservations(@Query() query: LibraryQuery) {
    return this.library.listReservations(query);
  }

  @Post('reservations')
  @Permission('LIBRARY_RESERVATION_CREATE')
  reserve(@Body() dto: ReservationDto, @Req() req: AuthRequest) {
    return this.library.reserve(dto, req.user.id);
  }

  @Post('reservations/:id/cancel')
  @Permission('LIBRARY_RESERVATION_CANCEL')
  cancelReservation(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.library.cancelReservation(id, req.user.id);
  }

  @Get('settings')
  @Permission('LIBRARY_SETTINGS_READ')
  settings() {
    return this.library.getSettings();
  }

  @Patch('settings')
  @Permission('LIBRARY_SETTINGS_UPDATE')
  updateSettings(@Body() dto: SettingsDto, @Req() req: AuthRequest) {
    return this.library.updateSettings(dto, req.user.id);
  }

  @Get('fines')
  @Permission('LIBRARY_FINE_READ')
  fines(@Query() query: LibraryQuery) {
    return this.library.listFines(query);
  }

  @Post('fines/:id/payments')
  @Permission('LIBRARY_FINE_PAY')
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PaymentDto,
    @Req() req: AuthRequest,
  ) {
    return this.library.pay(id, dto, req.user.id);
  }

  @Post('fines/:id/adjustments')
  @Permission('LIBRARY_FINE_ADJUST')
  adjust(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustmentDto,
    @Req() req: AuthRequest,
  ) {
    return this.library.adjust(id, dto, req.user.id);
  }

  @Get('dashboard')
  @Permission('LIBRARY_DASHBOARD_READ')
  dashboard() {
    return this.library.dashboard();
  }
}
