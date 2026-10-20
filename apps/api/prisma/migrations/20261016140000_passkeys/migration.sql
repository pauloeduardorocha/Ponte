CREATE TABLE "passkeys" (
 "id" TEXT PRIMARY KEY,
 "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "publicKey" BYTEA NOT NULL,
 "counter" BIGINT NOT NULL DEFAULT 0,
 "transports" TEXT[] NOT NULL,
 "name" VARCHAR(80) NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastUsedAt" TIMESTAMPTZ(6)
);
CREATE INDEX "passkeys_userId_idx" ON "passkeys"("userId");
CREATE TABLE "passkey_challenges" (
 "id" UUID PRIMARY KEY,
 "challenge" TEXT NOT NULL,
 "userId" UUID,
 "purpose" TEXT NOT NULL,
 "origin" TEXT NOT NULL,
 "expiresAt" TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX "passkey_challenges_expiresAt_idx" ON "passkey_challenges"("expiresAt");
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'church_runtime') THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON "passkeys", "passkey_challenges" TO church_runtime;
 END IF;
END $$;
