BEGIN;
-- AlterTable
ALTER TABLE "visitors" ADD COLUMN     "createdByUserId" UUID;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX visitors_creator_idx ON visitors("createdByUserId");
INSERT INTO role_permissions(role_id,permission_id) SELECT rp.role_id, target.id FROM role_permissions rp JOIN permissions legacy ON legacy.id=rp.permission_id JOIN permissions target ON (legacy.code='VISITOR_WRITE' AND target.code IN ('VISITOR_CREATE','VISITOR_UPDATE')) OR (legacy.code='EVENT_WRITE' AND target.code='EVENT_MANAGE') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name IN ('LEADER','PASTOR') AND p.code IN ('VISITOR_READ','VISITOR_CREATE','VISITOR_UPDATE','FOLLOWUP_READ','FOLLOWUP_CREATE','FOLLOWUP_UPDATE','SMALL_GROUP_READ','SMALL_GROUP_MANAGE','MINISTRY_READ','MINISTRY_MANAGE','EVENT_READ','EVENT_MANAGE','SCHEDULE_READ','SCHEDULE_MANAGE','ATTENDANCE_READ','ATTENDANCE_MANAGE','NOTIFICATION_READ','NOTIFICATION_SEND') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='PASTOR' AND p.code='OPERATION_SCOPE_ALL' ON CONFLICT DO NOTHING;
COMMIT;
