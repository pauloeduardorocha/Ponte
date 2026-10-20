import type { PrismaClient } from '@prisma/client';

// Check effective privileges, including inherited access and SET ROLE paths.
// Do not log URLs, passwords or database errors during startup.
export async function assertRestrictedDatabase(db: PrismaClient) {
  const [state] = await db.$queryRaw<{ safe: boolean }[]>`
    SELECT NOT (
      EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname=current_user
        AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls))
      OR EXISTS (SELECT 1 FROM pg_roles r WHERE
        (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
        AND pg_has_role(current_user,r.oid,'MEMBER'))
      OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND pg_has_role(current_user,c.relowner,'MEMBER'))
      OR has_schema_privilege(current_user,'public','CREATE')
      OR has_database_privilege(current_user,current_database(),'CREATE')
      OR has_database_privilege(current_user,current_database(),'TEMPORARY')
      OR has_table_privilege(current_user,'public.audit_logs','UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      OR has_any_column_privilege(current_user,'public.audit_logs','UPDATE')
      OR has_table_privilege(current_user,'public._prisma_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    ) AND has_table_privilege(current_user,'public.audit_logs','SELECT')
      AND has_table_privilege(current_user,'public.audit_logs','INSERT') AS safe
  `;
  if (state?.safe !== true) {
    throw new Error(
      'Production requires a restricted database login. Apply runtime-privileges.sql and configure the application login.',
    );
  }
}
