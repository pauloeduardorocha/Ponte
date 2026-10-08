BEGIN;
-- AlterTable
ALTER TABLE "visitors" ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "convertedAt" TIMESTAMP(3),
ADD COLUMN     "convertedByUserId" UUID,
ADD COLUMN     "firstName" VARCHAR(60) NOT NULL DEFAULT '',
ADD COLUMN     "gender" VARCHAR(30),
ADD COLUMN     "howDidYouHear" VARCHAR(200),
ADD COLUMN     "invitedByMemberId" UUID,
ADD COLUMN     "lastName" VARCHAR(60) NOT NULL DEFAULT '',
ADD COLUMN     "memberId" UUID;

-- AlterTable
ALTER TABLE "community_events" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "createdByUserId" UUID,
ADD COLUMN     "endsAt" TIMESTAMPTZ(6),
ADD COLUMN     "ministryId" UUID,
ADD COLUMN     "registrationRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smallGroupId" UUID,
ADD COLUMN     "type" VARCHAR(30) NOT NULL DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" UUID NOT NULL,
    "visitorId" UUID,
    "memberId" UUID,
    "assignedToUserId" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),
    "nextContactAt" TIMESTAMPTZ(6),
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_interactions" (
    "id" UUID NOT NULL,
    "followUpId" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "interactionDate" TIMESTAMPTZ(6) NOT NULL,
    "performedByUserId" UUID NOT NULL,
    "notes" VARCHAR(2000) NOT NULL,
    "nextActionAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "small_groups" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "leaderMemberId" UUID NOT NULL,
    "coLeaderMemberId" UUID,
    "hostMemberId" UUID,
    "address" VARCHAR(200) NOT NULL,
    "meetingDay" INTEGER NOT NULL,
    "meetingTime" VARCHAR(5) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "small_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "small_group_members" (
    "id" UUID NOT NULL,
    "smallGroupId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMPTZ(6),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "small_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ministries" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "leaderMemberId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ministries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ministry_members" (
    "id" UUID NOT NULL,
    "ministryId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMPTZ(6),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ministry_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "memberId" UUID,
    "visitorId" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'REGISTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_schedules" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "ministryId" UUID,
    "title" VARCHAR(160) NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "notes" VARCHAR(2000),
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_assignments" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "ministryId" UUID,
    "function" VARCHAR(120) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'INVITED',
    "confirmedAt" TIMESTAMPTZ(6),
    "notes" VARCHAR(2000),
    "replacedByAssignmentId" UUID,

    CONSTRAINT "volunteer_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" UUID NOT NULL,
    "memberId" UUID,
    "visitorId" UUID,
    "eventId" UUID,
    "smallGroupId" UUID,
    "attendanceDate" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    "registeredByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipientMemberId" UUID,
    "recipientVisitorId" UUID,
    "channel" VARCHAR(20) NOT NULL,
    "subject" VARCHAR(200),
    "content" VARCHAR(5000) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMPTZ(6),
    "sentAt" TIMESTAMPTZ(6),
    "error" VARCHAR(500),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "subject" VARCHAR(200),
    "content" VARCHAR(5000) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follow_ups_assignedToUserId_status_nextContactAt_idx" ON "follow_ups"("assignedToUserId", "status", "nextContactAt");

-- CreateIndex
CREATE INDEX "follow_ups_visitorId_idx" ON "follow_ups"("visitorId");

-- CreateIndex
CREATE INDEX "follow_ups_memberId_idx" ON "follow_ups"("memberId");

-- CreateIndex
CREATE INDEX "follow_up_interactions_followUpId_interactionDate_idx" ON "follow_up_interactions"("followUpId", "interactionDate");

-- CreateIndex
CREATE INDEX "small_groups_leaderMemberId_active_idx" ON "small_groups"("leaderMemberId", "active");

-- CreateIndex
CREATE INDEX "small_groups_coLeaderMemberId_idx" ON "small_groups"("coLeaderMemberId");

-- CreateIndex
CREATE INDEX "small_groups_meetingDay_active_idx" ON "small_groups"("meetingDay", "active");

-- CreateIndex
CREATE INDEX "small_group_members_smallGroupId_active_idx" ON "small_group_members"("smallGroupId", "active");

-- CreateIndex
CREATE INDEX "small_group_members_memberId_active_idx" ON "small_group_members"("memberId", "active");

-- CreateIndex
CREATE INDEX "ministries_leaderMemberId_active_idx" ON "ministries"("leaderMemberId", "active");

-- CreateIndex
CREATE INDEX "ministry_members_ministryId_active_idx" ON "ministry_members"("ministryId", "active");

-- CreateIndex
CREATE INDEX "ministry_members_memberId_active_idx" ON "ministry_members"("memberId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_eventId_memberId_key" ON "event_registrations"("eventId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_eventId_visitorId_key" ON "event_registrations"("eventId", "visitorId");

-- CreateIndex
CREATE INDEX "volunteer_schedules_ministryId_date_idx" ON "volunteer_schedules"("ministryId", "date");

-- CreateIndex
CREATE INDEX "volunteer_schedules_eventId_idx" ON "volunteer_schedules"("eventId");

-- CreateIndex
CREATE INDEX "volunteer_assignments_scheduleId_status_idx" ON "volunteer_assignments"("scheduleId", "status");

-- CreateIndex
CREATE INDEX "volunteer_assignments_memberId_status_idx" ON "volunteer_assignments"("memberId", "status");

-- CreateIndex
CREATE INDEX "attendances_memberId_attendanceDate_idx" ON "attendances"("memberId", "attendanceDate");

-- CreateIndex
CREATE INDEX "attendances_eventId_attendanceDate_idx" ON "attendances"("eventId", "attendanceDate");

-- CreateIndex
CREATE INDEX "attendances_smallGroupId_attendanceDate_idx" ON "attendances"("smallGroupId", "attendanceDate");

-- CreateIndex
CREATE INDEX "notifications_status_scheduledAt_idx" ON "notifications"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "notifications_recipientMemberId_createdAt_idx" ON "notifications"("recipientMemberId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_recipientVisitorId_createdAt_idx" ON "notifications"("recipientVisitorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_name_key" ON "notification_templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "visitors_memberId_key" ON "visitors"("memberId");

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_invitedByMemberId_fkey" FOREIGN KEY ("invitedByMemberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_convertedByUserId_fkey" FOREIGN KEY ("convertedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_events" ADD CONSTRAINT "community_events_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_events" ADD CONSTRAINT "community_events_ministryId_fkey" FOREIGN KEY ("ministryId") REFERENCES "ministries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_events" ADD CONSTRAINT "community_events_smallGroupId_fkey" FOREIGN KEY ("smallGroupId") REFERENCES "small_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "visitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_interactions" ADD CONSTRAINT "follow_up_interactions_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "follow_ups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_interactions" ADD CONSTRAINT "follow_up_interactions_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "small_groups" ADD CONSTRAINT "small_groups_leaderMemberId_fkey" FOREIGN KEY ("leaderMemberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "small_groups" ADD CONSTRAINT "small_groups_coLeaderMemberId_fkey" FOREIGN KEY ("coLeaderMemberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "small_groups" ADD CONSTRAINT "small_groups_hostMemberId_fkey" FOREIGN KEY ("hostMemberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "small_group_members" ADD CONSTRAINT "small_group_members_smallGroupId_fkey" FOREIGN KEY ("smallGroupId") REFERENCES "small_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "small_group_members" ADD CONSTRAINT "small_group_members_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ministries" ADD CONSTRAINT "ministries_leaderMemberId_fkey" FOREIGN KEY ("leaderMemberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ministry_members" ADD CONSTRAINT "ministry_members_ministryId_fkey" FOREIGN KEY ("ministryId") REFERENCES "ministries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ministry_members" ADD CONSTRAINT "ministry_members_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "community_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "visitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_schedules" ADD CONSTRAINT "volunteer_schedules_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "community_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_schedules" ADD CONSTRAINT "volunteer_schedules_ministryId_fkey" FOREIGN KEY ("ministryId") REFERENCES "ministries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_assignments" ADD CONSTRAINT "volunteer_assignments_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "volunteer_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_assignments" ADD CONSTRAINT "volunteer_assignments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_assignments" ADD CONSTRAINT "volunteer_assignments_ministryId_fkey" FOREIGN KEY ("ministryId") REFERENCES "ministries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_assignments" ADD CONSTRAINT "volunteer_assignments_replacedByAssignmentId_fkey" FOREIGN KEY ("replacedByAssignmentId") REFERENCES "volunteer_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "visitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "community_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_smallGroupId_fkey" FOREIGN KEY ("smallGroupId") REFERENCES "small_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientMemberId_fkey" FOREIGN KEY ("recipientMemberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientVisitorId_fkey" FOREIGN KEY ("recipientVisitorId") REFERENCES "visitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE visitors SET "firstName"=left(split_part(name,' ',1),60), "lastName"=CASE WHEN position(' ' in name)>0 THEN left(substring(name from position(' ' in name)+1),59) ELSE '' END WHERE "firstName"='';
ALTER TABLE visitors DROP CONSTRAINT visitor_status;
ALTER TABLE visitors ADD CONSTRAINT visitor_status CHECK(status IN ('NEW','CONTACTED','IN_FOLLOW_UP','INTEGRATING','INTEGRATED','INACTIVE','ARCHIVED'));
UPDATE community_events SET "endsAt"="startsAt" + interval '1 hour';
ALTER TABLE community_events ADD CONSTRAINT event_interval CHECK("endsAt" IS NULL OR "endsAt">"startsAt"), ADD CONSTRAINT event_capacity CHECK(capacity IS NULL OR capacity>0), ADD CONSTRAINT event_type CHECK(type IN ('SERVICE','CONFERENCE','MEETING','TRAINING','SMALL_GROUP','MINISTRY','SPECIAL','OTHER'));
ALTER TABLE follow_ups ADD CONSTRAINT followup_person CHECK(num_nonnulls("visitorId","memberId")=1), ADD CONSTRAINT followup_status CHECK(status IN ('PENDING','IN_PROGRESS','WAITING','COMPLETED','CANCELLED'));
ALTER TABLE follow_up_interactions ADD CONSTRAINT interaction_type CHECK(type IN ('PHONE','WHATSAPP','EMAIL','IN_PERSON','OTHER'));
ALTER TABLE small_groups ADD CONSTRAINT group_day CHECK("meetingDay" BETWEEN 0 AND 6), ADD CONSTRAINT group_time CHECK("meetingTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), ADD CONSTRAINT group_capacity CHECK(capacity IS NULL OR capacity>0);
ALTER TABLE small_group_members ADD CONSTRAINT group_role CHECK(role IN ('LEADER','CO_LEADER','HOST','MEMBER')), ADD CONSTRAINT group_leave CHECK((active AND "leftAt" IS NULL) OR (NOT active AND "leftAt">="joinedAt"));
ALTER TABLE ministry_members ADD CONSTRAINT ministry_role CHECK(role IN ('LEADER','MEMBER')), ADD CONSTRAINT ministry_leave CHECK((active AND "leftAt" IS NULL) OR (NOT active AND "leftAt">="joinedAt"));
CREATE UNIQUE INDEX group_active_member ON small_group_members("smallGroupId","memberId") WHERE active;
CREATE UNIQUE INDEX ministry_active_member ON ministry_members("ministryId","memberId") WHERE active;
ALTER TABLE event_registrations ADD CONSTRAINT registration_person CHECK(num_nonnulls("memberId","visitorId")=1), ADD CONSTRAINT registration_status CHECK(status IN ('REGISTERED','CANCELLED'));
ALTER TABLE volunteer_schedules ADD CONSTRAINT schedule_status CHECK(status IN ('DRAFT','PUBLISHED','CANCELLED','COMPLETED'));
ALTER TABLE volunteer_assignments ADD CONSTRAINT assignment_status CHECK(status IN ('INVITED','CONFIRMED','DECLINED','REPLACED','COMPLETED','ABSENT'));
CREATE UNIQUE INDEX assignment_active_member ON volunteer_assignments("scheduleId","memberId") WHERE status IN ('INVITED','CONFIRMED');
ALTER TABLE attendances ADD CONSTRAINT attendance_person CHECK(num_nonnulls("memberId","visitorId")=1), ADD CONSTRAINT attendance_activity CHECK(num_nonnulls("eventId","smallGroupId")<=1), ADD CONSTRAINT attendance_status CHECK(status IN ('PRESENT','ABSENT','EXCUSED')), ADD CONSTRAINT attendance_source CHECK(source IN ('MANUAL','EVENT','SMALL_GROUP','CHECK_IN','IMPORT'));
CREATE UNIQUE INDEX attendance_identity ON attendances(COALESCE("memberId","visitorId"),COALESCE("eventId","smallGroupId",'00000000-0000-0000-0000-000000000000'::uuid),"attendanceDate");
ALTER TABLE notifications ADD CONSTRAINT notification_person CHECK(num_nonnulls("recipientMemberId","recipientVisitorId")=1), ADD CONSTRAINT notification_channel CHECK(channel IN ('EMAIL','SMS','WHATSAPP','PUSH','INTERNAL')), ADD CONSTRAINT notification_status CHECK(status IN ('PENDING','SENT','FAILED','CANCELLED')), ADD CONSTRAINT notification_creator_fk FOREIGN KEY("createdByUserId") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE notification_templates ADD CONSTRAINT template_channel CHECK(channel IN ('EMAIL','SMS','WHATSAPP','PUSH','INTERNAL'));
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON follow_ups FOR EACH ROW EXECUTE FUNCTION audit_change('FollowUp');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON follow_up_interactions FOR EACH ROW EXECUTE FUNCTION audit_change('FollowUpInteraction');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON small_groups FOR EACH ROW EXECUTE FUNCTION audit_change('SmallGroup');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON small_group_members FOR EACH ROW EXECUTE FUNCTION audit_change('SmallGroupMember');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON ministries FOR EACH ROW EXECUTE FUNCTION audit_change('Ministry');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON ministry_members FOR EACH ROW EXECUTE FUNCTION audit_change('MinistryMember');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON event_registrations FOR EACH ROW EXECUTE FUNCTION audit_change('EventRegistration');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON volunteer_schedules FOR EACH ROW EXECUTE FUNCTION audit_change('VolunteerSchedule');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON volunteer_assignments FOR EACH ROW EXECUTE FUNCTION audit_change('VolunteerAssignment');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON attendances FOR EACH ROW EXECUTE FUNCTION audit_change('Attendance');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON notifications FOR EACH ROW EXECUTE FUNCTION audit_change('Notification');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON notification_templates FOR EACH ROW EXECUTE FUNCTION audit_change('NotificationTemplate');
INSERT INTO permissions(id,code,created_at) SELECT gen_random_uuid(),code,CURRENT_TIMESTAMP FROM unnest(ARRAY['OPERATION_SCOPE_ALL','VISITOR_CREATE','VISITOR_UPDATE','FOLLOWUP_READ','FOLLOWUP_CREATE','FOLLOWUP_UPDATE','SMALL_GROUP_READ','SMALL_GROUP_MANAGE','MINISTRY_READ','MINISTRY_MANAGE','EVENT_MANAGE','SCHEDULE_READ','SCHEDULE_MANAGE','ATTENDANCE_READ','ATTENDANCE_MANAGE','NOTIFICATION_READ','NOTIFICATION_SEND']) code ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name IN ('ADMIN','SUPER_ADMIN') AND p.code IN ('OPERATION_SCOPE_ALL','VISITOR_CREATE','VISITOR_UPDATE','FOLLOWUP_READ','FOLLOWUP_CREATE','FOLLOWUP_UPDATE','SMALL_GROUP_READ','SMALL_GROUP_MANAGE','MINISTRY_READ','MINISTRY_MANAGE','EVENT_MANAGE','SCHEDULE_READ','SCHEDULE_MANAGE','ATTENDANCE_READ','ATTENDANCE_MANAGE','NOTIFICATION_READ','NOTIFICATION_SEND') ON CONFLICT DO NOTHING;
COMMIT;
