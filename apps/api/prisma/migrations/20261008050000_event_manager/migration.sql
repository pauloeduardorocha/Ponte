-- AlterTable
ALTER TABLE "community_events" ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "display_name" VARCHAR(120);

-- AlterTable
ALTER TABLE "event_registrations" ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "qrToken" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "event_registrations" ALTER COLUMN "qrToken" DROP DEFAULT;

-- CreateTable
CREATE TABLE "event_manager_assignments" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assignedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "event_manager_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_tickets" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_coupons" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "courtesy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_payments" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gatewayFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_refunds" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,
    "reason" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
    "result" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "event_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_sessions" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_session_checkins" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "event_session_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_manager_assignments_userId_revokedAt_eventId_idx" ON "event_manager_assignments"("userId", "revokedAt", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_manager_assignments_eventId_userId_key" ON "event_manager_assignments"("eventId", "userId");

-- CreateIndex
CREATE INDEX "event_tickets_eventId_idx" ON "event_tickets"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_coupons_eventId_code_key" ON "event_coupons"("eventId", "code");

-- CreateIndex
CREATE INDEX "event_payments_eventId_status_idx" ON "event_payments"("eventId", "status");

-- CreateIndex
CREATE INDEX "event_refunds_paymentId_status_idx" ON "event_refunds"("paymentId", "status");

-- CreateIndex
CREATE INDEX "event_sessions_eventId_idx" ON "event_sessions"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_session_checkins_sessionId_registrationId_key" ON "event_session_checkins"("sessionId", "registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_qrToken_key" ON "event_registrations"("qrToken");

-- AddForeignKey
ALTER TABLE "event_manager_assignments" ADD CONSTRAINT "event_manager_assignments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "community_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_manager_assignments" ADD CONSTRAINT "event_manager_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_manager_assignments" ADD CONSTRAINT "event_manager_assignments_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "community_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_coupons" ADD CONSTRAINT "event_coupons_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "community_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_payments" ADD CONSTRAINT "event_payments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "community_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_payments" ADD CONSTRAINT "event_payments_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "event_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_refunds" ADD CONSTRAINT "event_refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "event_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "community_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_session_checkins" ADD CONSTRAINT "event_session_checkins_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "event_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_session_checkins" ADD CONSTRAINT "event_session_checkins_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "event_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RBAC deployment is independent of development demo seeding and preserves existing grants.
ALTER TABLE event_registrations DROP CONSTRAINT registration_status;
ALTER TABLE event_registrations ADD CONSTRAINT registration_status CHECK(status IN ('REGISTERED','APPROVED','CANCELLED'));
INSERT INTO roles(id,name,display_name,description,created_at,updated_at)
VALUES(gen_random_uuid(),'EVENT_MANAGER','Gestor de Eventos','Responsável pela gestão operacional dos eventos aos quais foi atribuído.',now(),now())
ON CONFLICT(name) DO UPDATE SET display_name=EXCLUDED.display_name,description=EXCLUDED.description;
INSERT INTO permissions(id,code,created_at)
SELECT gen_random_uuid(),code,now() FROM unnest(ARRAY['EVENT_READ','EVENT_CREATE','EVENT_UPDATE','EVENT_PUBLISH','EVENT_REGISTRATION_READ','EVENT_REGISTRATION_MANAGE','EVENT_REGISTRATION_APPROVE','EVENT_ATTENDEE_READ','EVENT_ATTENDEE_MANAGE','EVENT_TICKET_MANAGE','EVENT_COUPON_MANAGE','EVENT_PAYMENT_READ','EVENT_CHECKIN','EVENT_CHECKIN_REVERSE','EVENT_NOTIFICATION_SEND','EVENT_REPORT_READ','EVENT_REPORT_EXPORT','EVENT_MANAGER_ASSIGN','EVENT_REFUND_APPROVE']) code ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE
(r.name='EVENT_MANAGER' AND p.code IN ('EVENT_READ','EVENT_CREATE','EVENT_UPDATE','EVENT_PUBLISH','EVENT_REGISTRATION_READ','EVENT_REGISTRATION_MANAGE','EVENT_REGISTRATION_APPROVE','EVENT_ATTENDEE_READ','EVENT_ATTENDEE_MANAGE','EVENT_TICKET_MANAGE','EVENT_COUPON_MANAGE','EVENT_PAYMENT_READ','EVENT_CHECKIN','EVENT_CHECKIN_REVERSE','EVENT_NOTIFICATION_SEND','EVENT_REPORT_READ','EVENT_REPORT_EXPORT')) OR
(r.name IN ('ADMIN','SUPER_ADMIN') AND p.code IN ('EVENT_READ','EVENT_CREATE','EVENT_UPDATE','EVENT_PUBLISH','EVENT_REGISTRATION_READ','EVENT_REGISTRATION_MANAGE','EVENT_REGISTRATION_APPROVE','EVENT_ATTENDEE_READ','EVENT_ATTENDEE_MANAGE','EVENT_TICKET_MANAGE','EVENT_COUPON_MANAGE','EVENT_PAYMENT_READ','EVENT_CHECKIN','EVENT_CHECKIN_REVERSE','EVENT_NOTIFICATION_SEND','EVENT_REPORT_READ','EVENT_REPORT_EXPORT','EVENT_MANAGER_ASSIGN','EVENT_REFUND_APPROVE')) ON CONFLICT DO NOTHING;
INSERT INTO event_manager_assignments(id,"eventId","userId","assignedByUserId","createdAt")
SELECT gen_random_uuid(),id,"createdByUserId","createdByUserId",now() FROM community_events WHERE "createdByUserId" IS NOT NULL ON CONFLICT DO NOTHING;
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON event_manager_assignments FOR EACH ROW EXECUTE FUNCTION audit_change('EventManagerAssignment');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON event_tickets FOR EACH ROW EXECUTE FUNCTION audit_change('EventTicket');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON event_coupons FOR EACH ROW EXECUTE FUNCTION audit_change('EventCoupon');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON event_payments FOR EACH ROW EXECUTE FUNCTION audit_change('EventPayment');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON event_refunds FOR EACH ROW EXECUTE FUNCTION audit_change('EventRefund');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON event_sessions FOR EACH ROW EXECUTE FUNCTION audit_change('EventSession');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON event_session_checkins FOR EACH ROW EXECUTE FUNCTION audit_change('EventSessionCheckin');
ALTER TABLE event_tickets ADD CONSTRAINT event_ticket_price_positive CHECK (price >= 0 AND capacity > 0 AND "endsAt" > "startsAt");
ALTER TABLE event_coupons ADD CONSTRAINT event_coupon_discount_range CHECK ("discountPercent" BETWEEN 1 AND 100);
ALTER TABLE event_registrations ADD CONSTRAINT event_registration_id_event_unique UNIQUE(id,"eventId");
ALTER TABLE event_payments ADD CONSTRAINT event_payment_registration_event_fk FOREIGN KEY("registrationId","eventId") REFERENCES event_registrations(id,"eventId");
ALTER TABLE event_payments ADD CONSTRAINT event_payment_amounts CHECK(amount >= 0 AND discount >= 0 AND discount <= amount AND "gatewayFee" >= 0 AND "refundedAmount" >= 0 AND "refundedAmount" <= amount-discount);
