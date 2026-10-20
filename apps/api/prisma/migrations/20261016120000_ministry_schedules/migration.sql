ALTER TABLE volunteer_schedules ALTER COLUMN "eventId" DROP NOT NULL;
CREATE TABLE schedule_attachments (
 id UUID PRIMARY KEY, "scheduleId" UUID NOT NULL REFERENCES volunteer_schedules(id) ON DELETE CASCADE,
 filename VARCHAR(255) NOT NULL, mime VARCHAR(120) NOT NULL, size INTEGER NOT NULL CHECK (size > 0 AND size <= 5242880), content BYTEA NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX schedule_attachments_schedule_idx ON schedule_attachments("scheduleId");
