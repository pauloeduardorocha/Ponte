-- Apply with a database administrator after migrate deploy. Configure the
-- login/password separately; never use the migration owner as the API login.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='church_runtime') THEN
  CREATE ROLE church_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
 END IF;
END $$;
GRANT USAGE ON SCHEMA public TO church_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO church_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO church_runtime;
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.audit_logs FROM church_runtime;
REVOKE ALL ON public._prisma_migrations FROM church_runtime;
