ALTER TABLE "users" ADD COLUMN "push_birthdays" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE birthday_push_days (
  day date PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'church_runtime') THEN
  GRANT SELECT, INSERT ON birthday_push_days TO church_runtime;
 END IF;
END $$;
