import { Inject, Injectable, Optional } from '@nestjs/common';
import type { CurrentUser } from '@church/shared';
import { PrismaService } from '../../database/prisma.service';
import * as D from './operations.dto';
import { PushService } from './push.service';
import { NotificationOutboxService } from './notification-outbox.service';
import type { PrivateUpload } from '../finance/storage.service';
import {
  NOTIFICATION_PROVIDERS,
  type NotificationProvider,
} from './notification.provider';
import { OperationsContext } from './operations-context';
import { OperationsPeopleService } from './operations-people.service';
import { OperationsGroupsService } from './operations-groups.service';
import { OperationsEventsService } from './operations-events.service';
import { OperationsSchedulesService } from './operations-schedules.service';
import { ScheduleConflictsService } from './schedule-conflicts.service';
import { OperationsNotificationsService } from './operations-notifications.service';
import { OperationsDashboardService } from './operations-dashboard.service';
export { operationalMemberSelect } from './operations.projections';
@Injectable()
export class OperationsService {
  private readonly context: OperationsContext;
  private readonly peopleService: OperationsPeopleService;
  private readonly groupsService: OperationsGroupsService;
  private readonly eventsService: OperationsEventsService;
  private readonly schedulesService: OperationsSchedulesService;
  private readonly conflictsService: ScheduleConflictsService;
  private readonly notificationsService: OperationsNotificationsService;
  private readonly dashboardService: OperationsDashboardService;
  constructor(
    db: PrismaService,
    @Inject(NOTIFICATION_PROVIDERS) providers: NotificationProvider[],
    @Optional() push?: PushService,
    @Optional() outbox?: NotificationOutboxService,
  ) {
    this.context = new OperationsContext(db);
    this.peopleService = new OperationsPeopleService(this.context);
    this.groupsService = new OperationsGroupsService(this.context);
    this.conflictsService = new ScheduleConflictsService(this.context);
    this.eventsService = new OperationsEventsService(
      this.context,
      this.groupsService,
      this.conflictsService,
    );
    this.schedulesService = new OperationsSchedulesService(
      this.context,
      this.eventsService,
      this.conflictsService,
    );
    this.notificationsService = new OperationsNotificationsService(
      this.context,
      providers,
      push,
      outbox,
    );
    this.dashboardService = new OperationsDashboardService(
      this.context,
      this.conflictsService,
    );
  }
  all(user: CurrentUser) {
    return this.context.all(user);
  }
  groupScope(user: CurrentUser) {
    return this.context.groupScope(user);
  }
  ministryScope(user: CurrentUser) {
    return this.context.ministryScope(user);
  }
  visitorScope(user: CurrentUser) {
    return this.context.visitorScope(user);
  }
  eventScope(user: CurrentUser) {
    return this.context.eventScope(user);
  }
  people(q: D.OperationQuery, user: CurrentUser) {
    return this.peopleService.people(q, user);
  }
  assignees(q: D.OperationQuery, user: CurrentUser) {
    return this.peopleService.assignees(q, user);
  }
  visitors(q: D.OperationQuery, user: CurrentUser) {
    return this.peopleService.visitors(q, user);
  }
  visitor(id: string, user: CurrentUser) {
    return this.peopleService.visitor(id, user);
  }
  saveVisitor(
    id: string | undefined,
    dto: D.OperationalVisitorDto | D.OperationalVisitorPatch,
    user: CurrentUser,
  ) {
    return this.peopleService.saveVisitor(id, dto, user);
  }
  convertVisitor(id: string, dto: D.ConvertVisitorDto, user: CurrentUser) {
    return this.peopleService.convertVisitor(id, dto, user);
  }
  followUps(q: D.OperationQuery, user: CurrentUser) {
    return this.peopleService.followUps(q, user);
  }
  followUp(id: string, user: CurrentUser) {
    return this.peopleService.followUp(id, user);
  }
  saveFollowUp(
    id: string | undefined,
    dto: D.FollowUpDto | D.FollowUpPatch,
    user: CurrentUser,
  ) {
    return this.peopleService.saveFollowUp(id, dto, user);
  }
  interactions(id: string, q: D.OperationQuery, user: CurrentUser) {
    return this.peopleService.interactions(id, q, user);
  }
  addInteraction(id: string, dto: D.InteractionDto, user: CurrentUser) {
    return this.peopleService.addInteraction(id, dto, user);
  }
  groups(q: D.OperationQuery, user: CurrentUser) {
    return this.groupsService.groups(q, user);
  }
  group(id: string, user: CurrentUser) {
    return this.groupsService.group(id, user);
  }
  saveGroup(
    id: string | undefined,
    dto: D.SmallGroupDto | D.SmallGroupPatch,
    user: CurrentUser,
  ) {
    return this.groupsService.saveGroup(id, dto, user);
  }
  ministries(q: D.OperationQuery, user: CurrentUser) {
    return this.groupsService.ministries(q, user);
  }
  ministry(id: string, user: CurrentUser) {
    return this.groupsService.ministry(id, user);
  }
  saveMinistry(
    id: string | undefined,
    dto: D.MinistryDto | D.MinistryPatch,
    user: CurrentUser,
  ) {
    return this.groupsService.saveMinistry(id, dto, user);
  }
  participants(
    kind: 'group' | 'ministry',
    id: string,
    q: D.OperationQuery,
    user: CurrentUser,
  ) {
    return this.groupsService.participants(kind, id, q, user);
  }
  join(
    kind: 'group' | 'ministry',
    id: string,
    dto: D.ParticipantDto,
    user: CurrentUser,
  ) {
    return this.groupsService.join(kind, id, dto, user);
  }
  leave(
    kind: 'group' | 'ministry',
    id: string,
    membershipId: string,
    user: CurrentUser,
  ) {
    return this.groupsService.leave(kind, id, membershipId, user);
  }
  events(q: D.OperationQuery, user: CurrentUser) {
    return this.eventsService.events(q, user);
  }
  event(id: string, user: CurrentUser) {
    return this.eventsService.event(id, user);
  }
  saveEvent(
    id: string | undefined,
    dto: D.OperationalEventDto | D.OperationalEventPatch,
    user: CurrentUser,
  ) {
    return this.eventsService.saveEvent(id, dto, user);
  }
  registrations(id: string, q: D.OperationQuery, user: CurrentUser) {
    return this.eventsService.registrations(id, q, user);
  }
  register(id: string, dto: D.PersonDto, user: CurrentUser) {
    return this.eventsService.register(id, dto, user);
  }
  cancelRegistration(id: string, registrationId: string, user: CurrentUser) {
    return this.eventsService.cancelRegistration(id, registrationId, user);
  }
  schedules(q: D.OperationQuery, user: CurrentUser) {
    return this.schedulesService.schedules(q, user);
  }
  schedule(id: string, user: CurrentUser, manage = false) {
    return this.schedulesService.schedule(id, user, manage);
  }
  saveSchedule(
    id: string | undefined,
    dto: D.ScheduleDto | D.SchedulePatch,
    user: CurrentUser,
  ) {
    return this.schedulesService.saveSchedule(id, dto, user);
  }
  deleteSchedule(id: string, user: CurrentUser) {
    return this.schedulesService.deleteSchedule(id, user);
  }
  attachments(id: string, user: CurrentUser) {
    return this.schedulesService.attachments(id, user);
  }
  uploadAttachment(
    id: string,
    file: PrivateUpload,
    user: CurrentUser,
    totalSize?: number,
  ) {
    return this.schedulesService.uploadAttachment(id, file, user, totalSize);
  }
  appendAttachment(
    id: string,
    attachmentId: string,
    offset: number,
    file: PrivateUpload,
    user: CurrentUser,
  ) {
    return this.schedulesService.appendAttachment(
      id,
      attachmentId,
      offset,
      file,
      user,
    );
  }
  attachment(
    id: string,
    attachmentId: string,
    user: CurrentUser,
    remove = false,
  ) {
    return this.schedulesService.attachment(id, attachmentId, user, remove);
  }
  assignments(id: string, q: D.OperationQuery, user: CurrentUser) {
    return this.schedulesService.assignments(id, q, user);
  }
  addAssignment(
    id: string,
    dto: D.AssignmentDto,
    user: CurrentUser,
    replacesId?: string,
  ) {
    return this.schedulesService.addAssignment(id, dto, user, replacesId);
  }
  identity(user: CurrentUser) {
    return this.schedulesService.identity(user);
  }
  respond(
    id: string,
    assignmentId: string,
    dto: D.AssignmentResponseDto,
    user: CurrentUser,
  ) {
    return this.schedulesService.respond(id, assignmentId, dto, user);
  }
  assignmentStatus(
    id: string,
    assignmentId: string,
    dto: D.AssignmentStatusDto,
    user: CurrentUser,
  ) {
    return this.schedulesService.assignmentStatus(id, assignmentId, dto, user);
  }
  notifications(q: D.OperationQuery, user: CurrentUser) {
    return this.notificationsService.notifications(q, user);
  }
  unread(user: CurrentUser) {
    return this.notificationsService.unread(user);
  }
  readInbox(user: CurrentUser, id?: string) {
    return this.notificationsService.readInbox(user, id);
  }
  deleteInbox(user: CurrentUser, id: string) {
    return this.notificationsService.deleteInbox(user, id);
  }
  inbox(q: D.OperationQuery, user: CurrentUser) {
    return this.notificationsService.inbox(q, user);
  }
  notificationAudiences(kind: string, q: D.OperationQuery, user: CurrentUser) {
    return this.notificationsService.notificationAudiences(kind, q, user);
  }
  sendNotification(dto: D.NotificationDto, user: CurrentUser) {
    return this.notificationsService.sendNotification(dto, user);
  }
  notificationAction(id: string, user: CurrentUser, cancel = false) {
    return this.notificationsService.notificationAction(id, user, cancel);
  }
  notifyInternal(notification: Parameters<PushService['notifyInternal']>[0]) {
    return this.notificationsService.notifyInternal(notification);
  }
  templates(q: D.OperationQuery) {
    return this.notificationsService.templates(q);
  }
  saveTemplate(id: string | undefined, dto: D.TemplateDto | D.TemplatePatch) {
    return this.notificationsService.saveTemplate(id, dto);
  }
  visitorHistory(id: string, q: D.OperationQuery, user: CurrentUser) {
    return this.peopleService.visitorHistory(id, q, user);
  }
  dashboard(q: D.OperationQuery, user: CurrentUser) {
    return this.dashboardService.dashboard(q, user);
  }
}
