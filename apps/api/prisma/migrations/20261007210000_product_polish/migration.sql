BEGIN;
-- CreateTable
CREATE TABLE "visitors" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(32),
    "visitedAt" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'NEW',
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_events" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "location" VARCHAR(200) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    "description" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visitors_status_visitedAt_idx" ON "visitors"("status", "visitedAt");

-- CreateIndex
CREATE INDEX "community_events_status_startsAt_idx" ON "community_events"("status", "startsAt");

-- CreateIndex
CREATE INDEX "bank_imports_accountId_createdAt_idx" ON "bank_imports"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "bank_transactions_date_status_idx" ON "bank_transactions"("date", "status");

-- CreateIndex
CREATE INDEX "bank_transactions_memberId_idx" ON "bank_transactions"("memberId");

-- CreateIndex
CREATE INDEX "bank_transactions_categoryId_idx" ON "bank_transactions"("categoryId");

-- CreateIndex
CREATE INDEX "bank_transactions_supplierId_idx" ON "bank_transactions"("supplierId");

-- CreateIndex
CREATE INDEX "financial_attachments_expenseId_idx" ON "financial_attachments"("expenseId");

ALTER TABLE visitors ADD CONSTRAINT visitor_status CHECK(status IN ('NEW','CONTACTED','ARCHIVED'));
ALTER TABLE community_events ADD CONSTRAINT event_status CHECK(status IN ('SCHEDULED','COMPLETED','CANCELLED'));
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON visitors FOR EACH ROW EXECUTE FUNCTION audit_change('Visitor');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON community_events FOR EACH ROW EXECUTE FUNCTION audit_change('CommunityEvent');
INSERT INTO permissions(id,code,created_at) SELECT gen_random_uuid(),code,CURRENT_TIMESTAMP FROM unnest(ARRAY['VISITOR_READ','VISITOR_WRITE','EVENT_READ','EVENT_WRITE']) code ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='SUPER_ADMIN' AND p.code IN ('VISITOR_READ','VISITOR_WRITE','EVENT_READ','EVENT_WRITE') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='ADMIN' AND (p.code LIKE 'VISITOR\_%' OR p.code LIKE 'EVENT\_%' OR (p.code LIKE 'LIBRARY\_%' AND p.code LIKE '%\_READ') OR p.code IN ('FINANCE_TRANSACTION_READ','FINANCE_CATEGORY_READ','FINANCE_ACCOUNT_READ','FINANCE_SUPPLIER_READ','FINANCE_DASHBOARD_READ')) ON CONFLICT DO NOTHING;
COMMIT;
