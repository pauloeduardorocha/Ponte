-- Run as the migration owner after EVERY migrate deploy, in the application DB.
-- One atomic statement; no passwords or production connection strings in Git.
-- church_runtime is a NOLOGIN group; church_app is provisioned separately.
DO $security$
DECLARE item record;
BEGIN
 IF current_schema() IS DISTINCT FROM 'public' THEN
  RAISE EXCEPTION 'Security provisioning requires the public application schema';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='church_runtime') THEN
  CREATE ROLE church_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='church_runtime'
    AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls OR rolcanlogin))
    OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member='church_runtime'::regrole) THEN
  RAISE EXCEPTION 'church_runtime must be an unprivileged NOLOGIN group without memberships';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relowner='church_runtime'::regrole) THEN
  RAISE EXCEPTION 'church_runtime must not own application objects';
 END IF;

 REVOKE CREATE ON SCHEMA public FROM PUBLIC, church_runtime;
 EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC, church_runtime',current_database());
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO church_runtime',current_database());
 GRANT USAGE ON SCHEMA public TO church_runtime;

 -- Deliberately no blanket default grants: new tables require this reviewed step.
 REVOKE ALL ON ALL TABLES IN SCHEMA public FROM church_runtime;
 FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename <> '_prisma_migrations' LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',item.tablename);
  IF item.tablename='audit_logs' THEN
   GRANT SELECT, INSERT ON public.audit_logs TO church_runtime;
  ELSE
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO church_runtime',item.tablename);
  END IF;
 END LOOP;
 REVOKE ALL ON public._prisma_migrations FROM PUBLIC, church_runtime;
 GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO church_runtime;

 -- Prevent callers from redirecting unqualified references in invoker functions.
 -- pg_catalog is implicitly first; pg_temp explicitly last.
 FOR item IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid
                      AND d.classid='pg_proc'::regclass AND d.deptype='e') LOOP
  EXECUTE format('ALTER FUNCTION %s SET search_path TO public, pg_temp',item.signature);
 END LOOP;
END $security$;
