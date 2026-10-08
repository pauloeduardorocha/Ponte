import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Permission, PermissionAny } from '../auth/permission.decorator';
import { AuthRequest } from '../auth/auth.guard';
import { OperationsModule } from '../operations/operations.controller';
import { OperationsService } from '../operations/operations.service';
import * as O from '../operations/operations.dto';
import * as D from './events.dto';
import { EventsService } from './events.service';

@ApiTags('Eventos — gestão por atribuição')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(
    private readonly service: EventsService,
    private readonly operations: OperationsService,
  ) {}
  @Get()
  @Permission('EVENT_READ')
  @ApiOperation({ summary: 'Listar somente eventos autorizados' })
  list(@Query() q: O.OperationQuery, @Req() r: AuthRequest) {
    return this.operations.events(q, r.user);
  }
  @Post()
  @PermissionAny('EVENT_CREATE', 'EVENT_MANAGE', 'EVENT_WRITE')
  @ApiOperation({ summary: 'Criar evento e atribuir o criador como gestor' })
  create(@Body() dto: O.OperationalEventDto, @Req() r: AuthRequest) {
    return this.operations.saveEvent(undefined, dto, r.user);
  }
  @Get(':id')
  @Permission('EVENT_READ')
  detail(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthRequest) {
    return this.operations.event(id, r.user);
  }
  @Patch(':id')
  @PermissionAny('EVENT_UPDATE', 'EVENT_MANAGE', 'EVENT_WRITE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: O.OperationalEventPatch,
    @Req() r: AuthRequest,
  ) {
    return this.operations.saveEvent(id, dto, r.user);
  }
  @Post(':id/publish')
  @Permission('EVENT_PUBLISH')
  publish(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthRequest) {
    return this.service.publish(id, r.user);
  }
  @Get(':id/managers')
  @Permission('EVENT_MANAGER_ASSIGN', 'OPERATION_SCOPE_ALL')
  managers(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthRequest) {
    return this.service.managers(id, r.user);
  }
  @Post(':id/managers')
  @Permission('EVENT_MANAGER_ASSIGN', 'OPERATION_SCOPE_ALL')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.ManagerDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.assign(id, dto, r.user);
  }
  @Post(':id/managers/revoke')
  @Permission('EVENT_MANAGER_ASSIGN', 'OPERATION_SCOPE_ALL')
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.ManagerDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.assign(id, dto, r.user, true);
  }
  @Get(':id/registrations')
  @Permission('EVENT_REGISTRATION_READ')
  registrations(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: O.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.operations.registrations(id, q, r.user);
  }
  @Post(':id/registrations')
  @Permission('EVENT_REGISTRATION_MANAGE')
  register(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: O.PersonDto,
    @Req() r: AuthRequest,
  ) {
    return this.operations.register(id, dto, r.user);
  }
  @Post(':id/registrations/:registrationId/approve')
  @Permission('EVENT_REGISTRATION_APPROVE')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Req() r: AuthRequest,
  ) {
    return this.service.registration(id, registrationId, r.user, true);
  }
  @Post(':id/registrations/:registrationId/cancel')
  @Permission('EVENT_REGISTRATION_MANAGE')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Req() r: AuthRequest,
  ) {
    return this.operations.cancelRegistration(id, registrationId, r.user);
  }
  @Get(':id/attendees')
  @Permission('EVENT_ATTENDEE_READ')
  attendees(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: O.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.operations.registrations(id, q, r.user);
  }
  @Patch(':id/attendees/:registrationId/cancel')
  @Permission('EVENT_ATTENDEE_MANAGE')
  attendee(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Req() r: AuthRequest,
  ) {
    return this.service.registration(id, registrationId, r.user, false);
  }
  @Get(':id/tickets')
  @Permission('EVENT_TICKET_MANAGE')
  tickets(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: O.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.resources(id, 'tickets', q, r.user);
  }
  @Post(':id/tickets')
  @Permission('EVENT_TICKET_MANAGE')
  ticket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.TicketDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.ticket(id, dto, r.user);
  }
  @Patch(':id/tickets/:ticketId')
  @Permission('EVENT_TICKET_MANAGE')
  price(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: D.TicketDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.ticket(id, dto, r.user, ticketId);
  }
  @Get(':id/coupons')
  @Permission('EVENT_COUPON_MANAGE')
  coupons(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: O.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.resources(id, 'coupons', q, r.user);
  }
  @Post(':id/coupons')
  @Permission('EVENT_COUPON_MANAGE')
  coupon(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.CouponDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.coupon(id, dto, r.user);
  }
  @Get(':id/payments')
  @Permission('EVENT_PAYMENT_READ')
  @ApiOkResponse({ type: D.EventPaymentPageDto })
  payments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: O.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.payments(id, q, r.user);
  }
  @Post(':id/payments/:paymentId/refunds')
  @Permission('EVENT_PAYMENT_READ', 'EVENT_REGISTRATION_MANAGE')
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: D.RefundDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.refund(id, paymentId, dto, r.user);
  }
  @Post(':id/refunds/:refundId/approve')
  @Permission('EVENT_REFUND_APPROVE')
  approveRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('refundId', ParseUUIDPipe) refundId: string,
    @Req() r: AuthRequest,
  ) {
    return this.service.approveRefund(id, refundId, r.user);
  }
  @Get(':id/refunds')
  @Permission('EVENT_PAYMENT_READ')
  refunds(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: O.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.refunds(id, q, r.user);
  }
  @Get(':id/sessions/:sessionId/attendance')
  @Permission('EVENT_ATTENDEE_READ')
  sessionAttendance(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() q: O.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.sessionAttendance(id, sessionId, q, r.user);
  }
  @Get(':id/sessions')
  @Permission('EVENT_ATTENDEE_READ')
  sessions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: O.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.resources(id, 'sessions', q, r.user);
  }
  @Post(':id/sessions')
  @Permission('EVENT_ATTENDEE_MANAGE')
  session(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.SessionDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.session(id, dto, r.user);
  }
  @Post(':id/checkin')
  @Permission('EVENT_CHECKIN')
  checkin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.CheckinDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.checkin(id, dto, r.user);
  }
  @Post(':id/checkin/reverse')
  @Permission('EVENT_CHECKIN_REVERSE')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.CheckinDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.checkin(id, dto, r.user, true);
  }
  @Post(':id/notifications')
  @Permission('EVENT_NOTIFICATION_SEND')
  notify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.EventMessageDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.notify(id, dto, r.user);
  }
  @Get(':id/reports')
  @Permission('EVENT_REPORT_READ', 'EVENT_PAYMENT_READ')
  report(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthRequest) {
    return this.service.report(id, r.user);
  }
  @Get(':id/reports/export')
  @Permission('EVENT_REPORT_EXPORT', 'EVENT_PAYMENT_READ')
  @ApiOperation({
    summary: 'Exportar relatório operacional em JSON com auditoria',
  })
  export(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthRequest) {
    return this.service.report(id, r.user, true);
  }
}
@Module({
  imports: [OperationsModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
