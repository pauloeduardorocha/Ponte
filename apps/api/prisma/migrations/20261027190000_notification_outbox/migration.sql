CREATE TABLE notification_deliveries (
  "notificationId" UUID PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE ON UPDATE CASCADE,
  state VARCHAR(20) NOT NULL DEFAULT 'READY'
    CHECK (state IN ('HELD','READY','PROCESSING','DELIVERED','FAILED','UNCERTAIN','CANCELLED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  uncertain BOOLEAN NOT NULL DEFAULT false,
  "availableAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firstAttemptAt" TIMESTAMPTZ(6),
  "lockedUntil" TIMESTAMPTZ(6),
  "claimToken" UUID,
  payload JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX notification_deliveries_state_available_idx ON notification_deliveries(state,"availableAt");
CREATE INDEX notification_deliveries_state_lease_idx ON notification_deliveries(state,"lockedUntil");
-- Existing pending messages retain their explicit manual dispatch semantics.
-- We cannot infer whether a legacy external attempt was accepted before a crash.
INSERT INTO notification_deliveries ("notificationId",state)
SELECT id,'HELD' FROM notifications WHERE status='PENDING';
