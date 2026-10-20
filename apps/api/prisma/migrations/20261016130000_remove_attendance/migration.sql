-- Remove the retired attendance module and its role grants.
DROP TABLE "attendances";
DELETE FROM "role_permissions"
WHERE "permission_id" IN (
  SELECT "id" FROM "permissions" WHERE "code" IN ('ATTENDANCE_READ', 'ATTENDANCE_MANAGE')
);
DELETE FROM "permissions" WHERE "code" IN ('ATTENDANCE_READ', 'ATTENDANCE_MANAGE');
