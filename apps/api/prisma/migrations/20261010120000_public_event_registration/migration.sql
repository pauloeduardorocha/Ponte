ALTER TABLE community_events ADD COLUMN "isPaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE event_registrations ADD COLUMN "ticketId" UUID, ADD COLUMN "expiresAt" TIMESTAMP(3), ADD COLUMN "communicationConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE event_registrations ADD CONSTRAINT event_registration_ticket_fk FOREIGN KEY ("ticketId") REFERENCES event_tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE event_payments ADD COLUMN "stripeSessionId" TEXT, ADD COLUMN "stripePaymentIntentId" TEXT;
CREATE UNIQUE INDEX event_payments_stripe_session_key ON event_payments("stripeSessionId");
CREATE INDEX event_registrations_ticket_idx ON event_registrations("ticketId");
ALTER TABLE event_registrations DROP CONSTRAINT registration_status;
ALTER TABLE event_registrations ADD CONSTRAINT registration_status CHECK(status IN ('REGISTERED','APPROVED','CANCELLED','PENDING_PAYMENT'));
UPDATE community_events SET "isPaid" = true WHERE EXISTS (SELECT 1 FROM event_tickets WHERE "eventId" = community_events.id AND price > 0);
