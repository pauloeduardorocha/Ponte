import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { PrivateUpload } from '../finance/storage.service';
import {
  Body,
  Headers,
  BadRequestException,
  ParseIntPipe,
  Delete,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  Res,
  Controller,
  ForbiddenException,
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
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { Permission, PermissionAny } from '../auth/permission.decorator';
import type { AuthRequest } from '../auth/auth.guard';
import { OperationsService } from './operations.service';
import {
  InternalNotificationProvider,
  PushNotificationProvider,
  NOTIFICATION_PROVIDERS,
} from './notification.provider';
import * as D from './operations.dto';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { NotificationCountDto } from './push.dto';
import { EmailModule } from '../email/email.module';
import { EmailNotificationProvider } from './email-notification.provider';
import { NotificationOutboxService } from './notification-outbox.service';
import { NotificationWorkerController } from './notification-worker.controller';
@ApiTags('Operacao da igreja')
@ApiBearerAuth()
@Controller('operations')
export class OperationsController {
  constructor(private readonly service: OperationsService) {}
  @Get('inbox') inbox(@Query() q: D.OperationQuery, @Req() r: AuthRequest) {
    return this.service.inbox(q, r.user);
  }
  @Get('identity') identity(@Req() r: AuthRequest) {
    return this.service.identity(r.user);
  }
  @Get('inbox/unread')
  @ApiOkResponse({ type: NotificationCountDto })
  unread(@Req() r: AuthRequest) {
    return this.service.unread(r.user);
  }
  @Post('inbox/read-all')
  @ApiCreatedResponse({ type: NotificationCountDto })
  readAll(@Req() r: AuthRequest) {
    return this.service.readInbox(r.user);
  }
  @Post('inbox/:id/read')
  @ApiCreatedResponse({ type: NotificationCountDto })
  @ApiNotFoundResponse({
    description: 'Mensagem não encontrada na caixa pessoal.',
  })
  read(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthRequest) {
    return this.service.readInbox(r.user, id);
  }
  @Delete('inbox/:id')
  @ApiOperation({
    summary: 'Remover mensagem da própria caixa de entrada',
    description:
      'Preserva o histórico administrativo e atualiza a contagem de não lidas. Apenas mensagens enviadas ao usuário autenticado podem ser removidas.',
  })
  @ApiOkResponse({ type: NotificationCountDto })
  @ApiNotFoundResponse({
    description: 'Mensagem não encontrada na caixa pessoal.',
  })
  deleteInbox(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthRequest) {
    return this.service.deleteInbox(r.user, id);
  }
  @Post('schedules/:id/assignments/:assignmentId/respond')
  @PermissionAny('SCHEDULE_READ', 'COMMUNITY_READ')
  respond(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: D.AssignmentResponseDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.respond(id, assignmentId, dto, r.user);
  }
  @Get('dashboard') dashboard(
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    if (
      !r.user.permissions.some((p) =>
        [
          'MEMBER_READ',
          'VISITOR_READ',
          'FOLLOWUP_READ',
          'SMALL_GROUP_READ',
          'MINISTRY_READ',
          'EVENT_READ',
          'SCHEDULE_READ',
        ].includes(p),
      )
    )
      throw new ForbiddenException();
    return this.service.dashboard(q, r.user);
  }
  @Get('people') people(@Query() q: D.OperationQuery, @Req() r: AuthRequest) {
    if (
      !r.user.permissions.some((p) =>
        [
          'FOLLOWUP_READ',
          'SMALL_GROUP_READ',
          'MINISTRY_READ',
          'EVENT_READ',
          'SCHEDULE_READ',
          'NOTIFICATION_READ',
          'VISITOR_READ',
          'COMMUNITY_READ',
        ].includes(p),
      )
    )
      throw new ForbiddenException();
    return this.service.people(q, r.user);
  }
  @Get('assignees') @Permission('FOLLOWUP_READ') assignees(
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.assignees(q, r.user);
  }
  @Get('visitors') @Permission('VISITOR_READ') listVisitor(
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.visitors(q, r.user);
  }
  @Post('visitors') @Permission('VISITOR_CREATE') createVisitor(
    @Body() dto: D.OperationalVisitorDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.saveVisitor(undefined, dto, r.user);
  }
  @Patch('visitors/:id') @Permission('VISITOR_UPDATE') updateVisitor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.OperationalVisitorPatch,
    @Req() r: AuthRequest,
  ) {
    return this.service.saveVisitor(id, dto, r.user);
  }
  @Get('follow-ups') @Permission('FOLLOWUP_READ') listFollowUp(
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.followUps(q, r.user);
  }
  @Post('follow-ups') @Permission('FOLLOWUP_CREATE') createFollowUp(
    @Body() dto: D.FollowUpDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.saveFollowUp(undefined, dto, r.user);
  }
  @Patch('follow-ups/:id') @Permission('FOLLOWUP_UPDATE') updateFollowUp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.FollowUpPatch,
    @Req() r: AuthRequest,
  ) {
    return this.service.saveFollowUp(id, dto, r.user);
  }
  @Get('small-groups') @Permission('SMALL_GROUP_READ') listGroup(
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.groups(q, r.user);
  }
  @Post('small-groups') @Permission('SMALL_GROUP_MANAGE') createGroup(
    @Body() dto: D.SmallGroupDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.saveGroup(undefined, dto, r.user);
  }
  @Patch('small-groups/:id') @Permission('SMALL_GROUP_MANAGE') updateGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.SmallGroupPatch,
    @Req() r: AuthRequest,
  ) {
    return this.service.saveGroup(id, dto, r.user);
  }
  @Get('ministries')
  @PermissionAny('MINISTRY_READ', 'COMMUNITY_READ')
  listMinistry(@Query() q: D.OperationQuery, @Req() r: AuthRequest) {
    return this.service.ministries(q, r.user);
  }
  @Post('ministries')
  @PermissionAny('MINISTRY_MANAGE', 'COMMUNITY_READ')
  createMinistry(@Body() dto: D.MinistryDto, @Req() r: AuthRequest) {
    return this.service.saveMinistry(undefined, dto, r.user);
  }
  @Patch('ministries/:id')
  @PermissionAny('MINISTRY_MANAGE', 'COMMUNITY_READ')
  updateMinistry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.MinistryPatch,
    @Req() r: AuthRequest,
  ) {
    return this.service.saveMinistry(id, dto, r.user);
  }
  @Get('events') @Permission('EVENT_READ') listEvent(
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.events(q, r.user);
  }
  @Post('events') @PermissionAny('EVENT_MANAGE', 'EVENT_CREATE') createEvent(
    @Body() dto: D.OperationalEventDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.saveEvent(undefined, dto, r.user);
  }
  @Patch('events/:id')
  @PermissionAny('EVENT_MANAGE', 'EVENT_UPDATE')
  updateEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.OperationalEventPatch,
    @Req() r: AuthRequest,
  ) {
    return this.service.saveEvent(id, dto, r.user);
  }
  @Get('schedules')
  @ApiOperation({
    description:
      'Lista apenas escalas dos ministérios em que a conta é líder principal ou participante ativo; administradores com OPERATION_SCOPE_ALL têm acesso global. canCreate indica se existe algum ministério que a conta pode gerir, independentemente dos filtros.',
  })
  @PermissionAny('SCHEDULE_READ', 'COMMUNITY_READ')
  listSchedule(@Query() q: D.OperationQuery, @Req() r: AuthRequest) {
    return this.service.schedules(q, r.user);
  }
  @Post('schedules')
  @ApiOperation({
    description:
      'Exige ministryId e liderança no ministério selecionado, ou acesso administrativo global. eventId é opcional e não concede acesso ao ministério.',
  })
  @PermissionAny('SCHEDULE_MANAGE', 'COMMUNITY_READ')
  createSchedule(@Body() dto: D.ScheduleDto, @Req() r: AuthRequest) {
    return this.service.saveSchedule(undefined, dto, r.user);
  }
  @Patch('schedules/:id')
  @PermissionAny('SCHEDULE_MANAGE', 'COMMUNITY_READ')
  updateSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.SchedulePatch,
    @Req() r: AuthRequest,
  ) {
    return this.service.saveSchedule(id, dto, r.user);
  }
  @Post('visitors/:id/convert')
  @Permission('VISITOR_UPDATE', 'MEMBER_CREATE')
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.ConvertVisitorDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.convertVisitor(id, dto, r.user);
  }
  @Get('visitors/:id/history')
  @Permission('VISITOR_READ', 'FOLLOWUP_READ')
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.visitorHistory(id, q, r.user);
  }
  @Get('follow-ups/:id/interactions') @Permission('FOLLOWUP_READ') interactions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.interactions(id, q, r.user);
  }
  @Post('follow-ups/:id/interactions') @Permission('FOLLOWUP_UPDATE') interact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.InteractionDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.addInteraction(id, dto, r.user);
  }
  @Get('small-groups/:id/participants')
  @Permission('SMALL_GROUP_READ')
  participantsgroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.participants('group', id, q, r.user);
  }
  @Post('small-groups/:id/participants')
  @Permission('SMALL_GROUP_MANAGE')
  joingroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.ParticipantDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.join('group', id, dto, r.user);
  }
  @Post('small-groups/:id/participants/:participantId/leave')
  @Permission('SMALL_GROUP_MANAGE')
  leavegroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Req() r: AuthRequest,
  ) {
    return this.service.leave('group', id, participantId, r.user);
  }
  @Get('ministries/:id/participants')
  @PermissionAny('MINISTRY_READ', 'COMMUNITY_READ')
  participantsministry(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.participants('ministry', id, q, r.user);
  }
  @Post('ministries/:id/participants')
  @PermissionAny('MINISTRY_MANAGE', 'COMMUNITY_READ')
  joinministry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.ParticipantDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.join('ministry', id, dto, r.user);
  }
  @Post('ministries/:id/participants/:participantId/leave')
  @PermissionAny('MINISTRY_MANAGE', 'COMMUNITY_READ')
  leaveministry(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Req() r: AuthRequest,
  ) {
    return this.service.leave('ministry', id, participantId, r.user);
  }
  @Get('events/:id/registrations')
  @PermissionAny('EVENT_MANAGE', 'EVENT_REGISTRATION_READ')
  registrations(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.registrations(id, q, r.user);
  }
  @Post('events/:id/registrations')
  @PermissionAny('EVENT_MANAGE', 'EVENT_REGISTRATION_MANAGE')
  register(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.PersonDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.register(id, dto, r.user);
  }
  @Post('events/:id/registrations/:registrationId/cancel')
  @PermissionAny('EVENT_MANAGE', 'EVENT_REGISTRATION_MANAGE')
  cancelRegistration(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Req() r: AuthRequest,
  ) {
    return this.service.cancelRegistration(id, registrationId, r.user);
  }
  @Get('schedules/:id/assignments')
  @PermissionAny('SCHEDULE_READ', 'COMMUNITY_READ')
  assignments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.assignments(id, q, r.user);
  }
  @Post('schedules/:id/assignments')
  @PermissionAny('SCHEDULE_MANAGE', 'COMMUNITY_READ')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.AssignmentDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.addAssignment(id, dto, r.user);
  }
  @Patch('schedules/:id/assignments/:assignmentId')
  @PermissionAny('SCHEDULE_MANAGE', 'COMMUNITY_READ')
  assignmentStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: D.AssignmentStatusDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.assignmentStatus(id, assignmentId, dto, r.user);
  }
  @Post('schedules/:id/assignments/:assignmentId/replace')
  @PermissionAny('SCHEDULE_MANAGE', 'COMMUNITY_READ')
  replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: D.AssignmentDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.addAssignment(id, dto, r.user, assignmentId);
  }
  @Delete('schedules/:id')
  deleteSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() r: AuthRequest,
  ) {
    return this.service.deleteSchedule(id, r.user);
  }
  @Get('schedules/:id/attachments')
  attachments(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthRequest) {
    return this.service.attachments(id, r.user);
  }
  @Post('schedules/:id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  uploadAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: PrivateUpload,
    @Req() r: AuthRequest,
  ) {
    return this.service.uploadAttachment(id, file, r.user);
  }
  @Post('schedules/:id/attachments/chunks/:totalSize')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  startAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('totalSize', ParseIntPipe) totalSize: number,
    @UploadedFile() file: PrivateUpload,
    @Req() r: AuthRequest,
  ) {
    return this.service.uploadAttachment(id, file, r.user, totalSize);
  }
  @Post('schedules/:id/attachments/:attachmentId/chunks/:offset')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  appendAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Param('offset', ParseIntPipe) offset: number,
    @UploadedFile() file: PrivateUpload,
    @Req() r: AuthRequest,
  ) {
    return this.service.appendAttachment(
      id,
      attachmentId,
      offset,
      file,
      r.user,
    );
  }
  @Get('schedules/:id/attachments/:attachmentId')
  async attachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Headers('range') range: string | undefined,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.service.attachment(id, attachmentId, r.user);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const content = Buffer.from(file!.content);
    let buffer = content;
    res.setHeader('Accept-Ranges', 'bytes');
    if (range) {
      const match = /^bytes=(\d+)-(\d+)$/.exec(range);
      if (!match) throw new BadRequestException('Intervalo inv\u00e1lido.');
      const start = Number(match[1]),
        end = Number(match[2]);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= content.length ||
        end >= content.length ||
        end - start + 1 > 2 * 1024 * 1024
      )
        throw new BadRequestException('Intervalo inv\u00e1lido.');
      buffer = content.subarray(start, end + 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${content.length}`);
    }
    return new StreamableFile(buffer, {
      type: file!.mime,
      disposition:
        "attachment; filename*=UTF-8''" + encodeURIComponent(file!.filename),
    });
  }
  @Delete('schedules/:id/attachments/:attachmentId')
  removeAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() r: AuthRequest,
  ) {
    return this.service.attachment(id, attachmentId, r.user, true);
  }
  @Get('notifications') @Permission('NOTIFICATION_READ') notifications(
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.notifications(q, r.user);
  }
  @Post('notifications')
  @ApiOperation({
    summary: 'Criar uma notificação',
    description:
      'Selecione exatamente um público: recipientMemberId, recipientVisitorId, recipientMemberIds, recipientVisitorIds, smallGroupIds, ministryIds, roleIds ou allMembers=true. Arrays aceitam entre 1 e 100 UUIDs e removem IDs repetidos. Destinatários explícitos são validados antes da criação. Grupos e ministérios respeitam o escopo de gestão; roles e todos os membros exigem OPERATION_SCOPE_ALL. Sem scheduledAt, persiste uma intenção durável e tenta enviar após o commit; falhas transitórias podem retornar PENDING. Com scheduledAt, cria PENDING para envio manual após a data. O envio coletivo retorna total, sent, failed, pending e status (SENT, FAILED, PARTIAL ou PENDING); o individual preserva sua resposta. Canal sem provedor retorna 409 antes da criação de envio imediato.',
  })
  @Permission('NOTIFICATION_SEND')
  notify(@Body() dto: D.NotificationDto, @Req() r: AuthRequest) {
    return this.service.sendNotification(dto, r.user);
  }
  @Get('notification-audiences/:kind')
  @Permission('NOTIFICATION_SEND')
  notificationAudiences(
    @Param('kind') kind: string,
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.notificationAudiences(kind, q, r.user);
  }
  @Post('notifications/:id/send') @Permission('NOTIFICATION_SEND') dispatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() r: AuthRequest,
  ) {
    return this.service.notificationAction(id, r.user);
  }
  @Post('notifications/:id/cancel')
  @Permission('NOTIFICATION_SEND')
  cancelNotification(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() r: AuthRequest,
  ) {
    return this.service.notificationAction(id, r.user, true);
  }
  @Get('notification-templates') @Permission('NOTIFICATION_READ') templates(
    @Query() q: D.OperationQuery,
  ) {
    return this.service.templates(q);
  }
  @Post('notification-templates')
  @Permission('NOTIFICATION_SEND', 'OPERATION_SCOPE_ALL')
  createTemplate(@Body() dto: D.TemplateDto) {
    return this.service.saveTemplate(undefined, dto);
  }
  @Patch('notification-templates/:id')
  @Permission('NOTIFICATION_SEND', 'OPERATION_SCOPE_ALL')
  editTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.TemplatePatch,
  ) {
    return this.service.saveTemplate(id, dto);
  }
}
@Module({
  imports: [EmailModule],
  controllers: [OperationsController, PushController, NotificationWorkerController],
  providers: [
    OperationsService,
    NotificationOutboxService,
    InternalNotificationProvider,
    PushService,
    PushNotificationProvider,
    EmailNotificationProvider,
    {
      provide: NOTIFICATION_PROVIDERS,
      useFactory: (
        internal: InternalNotificationProvider,
        push: PushNotificationProvider,
        email: EmailNotificationProvider,
      ) => [internal, push, ...(email.configured ? [email] : [])],
      inject: [
        InternalNotificationProvider,
        PushNotificationProvider,
        EmailNotificationProvider,
      ],
    },
  ],
  exports: [OperationsService, PushService],
})
export class OperationsModule {}
