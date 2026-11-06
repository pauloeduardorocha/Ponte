CREATE TABLE "live_translation" (
  "id" VARCHAR(20) NOT NULL,
  "deviceTokenHash" VARCHAR(64) NOT NULL,
  "sessionId" UUID,
  "audienceUrl" VARCHAR(512),
  "expiresAt" TIMESTAMPTZ(6),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "live_translation_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'church_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "live_translation" TO church_runtime;
  END IF;
END $$;
