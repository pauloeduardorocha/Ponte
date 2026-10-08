import {
  Body,
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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission, PermissionAny } from '../auth/permission.decorator';
import type { AuthRequest } from '../auth/auth.guard';
import { OperationsService } from './operations.service';
import {
  InternalNotificationProvider,
  NOTIFICATION_PROVIDERS,
} from './notification.provider';
import * as D from './operations.dto';
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
  @Post('schedules/:id/assignments/:assignmentId/respond')
  @Permission('SCHEDULE_READ')
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
          'VISITOR_READ',
          'FOLLOWUP_READ',
          'SMALL_GROUP_READ',
          'MINISTRY_READ',
          'EVENT_READ',
          'SCHEDULE_READ',
          'ATTENDANCE_READ',
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
          'ATTENDANCE_READ',
          'NOTIFICATION_READ',
          'VISITOR_READ',
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
  @Get('ministries') @Permission('MINISTRY_READ') listMinistry(
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.ministries(q, r.user);
  }
  @Post('ministries') @Permission('MINISTRY_MANAGE') createMinistry(
    @Body() dto: D.MinistryDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.saveMinistry(undefined, dto, r.user);
  }
  @Patch('ministries/:id') @Permission('MINISTRY_MANAGE') updateMinistry(
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
  @Get('schedules') @Permission('SCHEDULE_READ') listSchedule(
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.schedules(q, r.user);
  }
  @Post('schedules') @Permission('SCHEDULE_MANAGE') createSchedule(
    @Body() dto: D.ScheduleDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.saveSchedule(undefined, dto, r.user);
  }
  @Patch('schedules/:id') @Permission('SCHEDULE_MANAGE') updateSchedule(
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
  @Permission('MINISTRY_READ')
  participantsministry(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.participants('ministry', id, q, r.user);
  }
  @Post('ministries/:id/participants')
  @Permission('MINISTRY_MANAGE')
  joinministry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.ParticipantDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.join('ministry', id, dto, r.user);
  }
  @Post('ministries/:id/participants/:participantId/leave')
  @Permission('MINISTRY_MANAGE')
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
  @Get('schedules/:id/assignments') @Permission('SCHEDULE_READ') assignments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.assignments(id, q, r.user);
  }
  @Post('schedules/:id/assignments') @Permission('SCHEDULE_MANAGE') assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.AssignmentDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.addAssignment(id, dto, r.user);
  }
  @Patch('schedules/:id/assignments/:assignmentId')
  @Permission('SCHEDULE_MANAGE')
  assignmentStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: D.AssignmentStatusDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.assignmentStatus(id, assignmentId, dto, r.user);
  }
  @Post('schedules/:id/assignments/:assignmentId/replace')
  @Permission('SCHEDULE_MANAGE')
  replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: D.AssignmentDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.addAssignment(id, dto, r.user, assignmentId);
  }
  @Get('attendance') @Permission('ATTENDANCE_READ') attendance(
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.attendance(q, r.user);
  }
  @Post('attendance') @Permission('ATTENDANCE_MANAGE') record(
    @Body() dto: D.AttendanceDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.recordAttendance(dto, r.user);
  }
  @Patch('attendance/:id') @Permission('ATTENDANCE_MANAGE') editAttendance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: D.AttendancePatch,
    @Req() r: AuthRequest,
  ) {
    return this.service.updateAttendance(id, dto, r.user);
  }
  @Get('notifications') @Permission('NOTIFICATION_READ') notifications(
    @Query() q: D.OperationQuery,
    @Req() r: AuthRequest,
  ) {
    return this.service.notifications(q, r.user);
  }
  @Post('notifications') @Permission('NOTIFICATION_SEND') notify(
    @Body() dto: D.NotificationDto,
    @Req() r: AuthRequest,
  ) {
    return this.service.sendNotification(dto, r.user);
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
  controllers: [OperationsController],
  providers: [
    OperationsService,
    InternalNotificationProvider,
    {
      provide: NOTIFICATION_PROVIDERS,
      useFactory: (internal: InternalNotificationProvider) => [internal],
      inject: [InternalNotificationProvider],
    },
  ],
  exports: [OperationsService],
})
export class OperationsModule {}
