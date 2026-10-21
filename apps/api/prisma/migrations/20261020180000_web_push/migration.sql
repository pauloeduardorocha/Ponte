ALTER TABLE "notifications" ADD COLUMN "readAt" TIMESTAMPTZ(6);
CREATE TABLE "push_subscriptions" (
  "id" UUID PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" VARCHAR(2048) NOT NULL UNIQUE,
  "p256dh" VARCHAR(87) NOT NULL,
  "auth" VARCHAR(22) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'church_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "push_subscriptions" TO church_runtime;
  END IF;
END $$;
