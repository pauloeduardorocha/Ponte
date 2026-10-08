BEGIN;
-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "ip" VARCHAR(64),
ADD COLUMN     "new_values" JSONB,
ADD COLUMN     "old_values" JSONB,
ADD COLUMN     "transaction_id" VARCHAR(32),
ADD COLUMN     "user_agent" VARCHAR(1024);

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "anonymized_at" TIMESTAMPTZ(6),
ADD COLUMN     "legal_hold" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "member_id" UUID;

-- CreateTable
CREATE TABLE "auth_login_throttles" (
    "key" VARCHAR(64) NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "locked_until" TIMESTAMPTZ(6),

    CONSTRAINT "auth_login_throttles_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "privacy_requests" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "details" VARCHAR(2000) NOT NULL,
    "requested_by" UUID NOT NULL,
    "resolved_by" UUID,
    "resolution" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_consents" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "purpose" VARCHAR(120) NOT NULL,
    "policy_version" VARCHAR(120) NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_retention_policies" (
    "data_class" VARCHAR(64) NOT NULL,
    "minimum_months" INTEGER NOT NULL,
    "legal_basis" VARCHAR(2000) NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "privacy_retention_policies_pkey" PRIMARY KEY ("data_class")
);

-- CreateIndex
CREATE INDEX "auth_login_throttles_window_start_idx" ON "auth_login_throttles"("window_start");

-- CreateIndex
CREATE INDEX "privacy_requests_member_id_status_idx" ON "privacy_requests"("member_id", "status");

-- CreateIndex
CREATE INDEX "member_consents_member_id_purpose_created_at_idx" ON "member_consents"("member_id", "purpose", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_member_id_key" ON "users"("member_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_consents" ADD CONSTRAINT "member_consents_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill available historical snapshots; unavailable old values remain NULL.
UPDATE audit_logs SET old_values=metadata->'before', new_values=metadata->'after';
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at);
CREATE INDEX audit_logs_action_created_at_idx ON audit_logs(action,created_at);
CREATE INDEX audit_logs_transaction_entity_idx ON audit_logs(transaction_id,entity_type,entity_id);

CREATE FUNCTION audit_clean(value jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; item record;
BEGIN
 IF value IS NULL THEN RETURN NULL; END IF;
 IF jsonb_typeof(value)='object' THEN
  result='{}'::jsonb;
  FOR item IN SELECT j.k AS key, j.v FROM jsonb_each(value) AS j(k,v) LOOP
   IF lower(item.key) NOT IN ('password','passwordhash','password_hash','currentpassword','newpassword','token','tokenhash','token_hash','accesstoken','refreshtoken','storagekey','storage_key') THEN
    IF item.key IN ('amount','openingBalance','dailyFine','paidAmount','amountPaid','opening_balance','daily_fine','paid_amount') AND jsonb_typeof(item.v)='number' THEN result=result||jsonb_build_object(item.key,to_jsonb(item.v#>>'{}')); ELSE result=result||jsonb_build_object(item.key,audit_clean(item.v)); END IF;
   END IF;
  END LOOP;
  RETURN result;
 ELSIF jsonb_typeof(value)='array' THEN
  SELECT coalesce(jsonb_agg(audit_clean(v)),'[]'::jsonb) INTO result FROM jsonb_array_elements(value) v;
  RETURN result;
 ELSIF jsonb_typeof(value)='number' THEN RETURN value;
 ELSE RETURN value;
 END IF;
END $$;
CREATE FUNCTION audit_enrich() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior record;
BEGIN
 NEW.actor_id=coalesce(nullif(current_setting('app.audit_user',true),'')::uuid,NEW.actor_id);
 NEW.ip=coalesce(nullif(current_setting('app.audit_ip',true),''),NEW.ip);
 NEW.user_agent=coalesce(nullif(current_setting('app.audit_agent',true),''),NEW.user_agent);
 NEW.transaction_id=txid_current()::text;
 IF NEW.action NOT LIKE 'DATA\_%' THEN
  SELECT old_values,new_values INTO prior FROM audit_logs WHERE transaction_id=NEW.transaction_id AND entity_type=NEW.entity_type AND entity_id IS NOT DISTINCT FROM NEW.entity_id AND action LIKE 'DATA\_%' ORDER BY created_at DESC,id DESC LIMIT 1;
  IF FOUND THEN NEW.old_values=coalesce(NEW.old_values,prior.old_values); NEW.new_values=coalesce(NEW.new_values,prior.new_values); END IF;
 END IF;
 NEW.old_values=audit_clean(NEW.old_values); NEW.new_values=audit_clean(NEW.new_values); NEW.metadata=audit_clean(NEW.metadata);
 RETURN NEW;
END $$;
CREATE TRIGGER audit_enrich_before_insert BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_enrich();
CREATE FUNCTION audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit history is append-only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_immutable();
CREATE FUNCTION audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_data jsonb; new_data jsonb; key text;
BEGIN
 IF TG_OP<>'INSERT' THEN old_data=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_data=to_jsonb(NEW); END IF;
 IF TG_OP='UPDATE' AND old_data IS NOT DISTINCT FROM new_data THEN RETURN NEW; END IF;
 key=coalesce(new_data->>'id',old_data->>'id',new_data->>'data_class',old_data->>'data_class',concat_ws('/',coalesce(new_data->>'user_id',old_data->>'user_id',new_data->>'role_id',old_data->>'role_id'),coalesce(new_data->>'role_id',old_data->>'role_id',new_data->>'permission_id',old_data->>'permission_id')));
 INSERT INTO audit_logs(id,action,entity_type,entity_id,old_values,new_values,created_at) VALUES(gen_random_uuid(),'DATA_'||TG_ARGV[0]||'_'||TG_OP,TG_ARGV[0],key,old_data,new_data,clock_timestamp());
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DO $$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('members','Member'),('users','User'),('roles','Role'),('permissions','Permission'),('user_roles','UserRole'),('role_permissions','RolePermission'),
  ('financial_categories','FinancialCategory'),('bank_accounts','BankAccount'),('suppliers','Supplier'),('incomes','Income'),('expenses','Expense'),('contributions','Contribution'),('financial_attachments','FinancialAttachment'),('bank_imports','BankImport'),('bank_transactions','BankTransaction'),('bank_reconciliations','BankReconciliation'),
  ('library_fines','Fine'),('library_fine_payments','FinePayment'),('library_fine_adjustments','FineAdjustment'),('library_loans','Loan'),('library_reservations','Reservation'),('library_books','Book'),('library_copies','BookCopy'),('library_settings','LibrarySettings'),
  ('privacy_requests','PrivacyRequest'),('member_consents','MemberConsent'),('privacy_retention_policies','PrivacyRetentionPolicy')
 ) AS entries(tab,entity) LOOP
  EXECUTE format('CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_change(%L)',item.tab,item.entity);
 END LOOP;
END $$;

ALTER TABLE bank_transactions ADD CONSTRAINT bank_category_fk FOREIGN KEY("categoryId") REFERENCES financial_categories(id) ON DELETE RESTRICT;
ALTER TABLE bank_transactions ADD CONSTRAINT bank_member_fk FOREIGN KEY("memberId") REFERENCES members(id) ON DELETE RESTRICT;
ALTER TABLE bank_transactions ADD CONSTRAINT bank_supplier_fk FOREIGN KEY("supplierId") REFERENCES suppliers(id) ON DELETE RESTRICT;
ALTER TABLE bank_transactions ADD CONSTRAINT bank_classified_by_fk FOREIGN KEY("classifiedBy") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE bank_transactions ADD CONSTRAINT bank_associated_by_fk FOREIGN KEY("associatedBy") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE bank_transactions ADD CONSTRAINT bank_duplicate_by_fk FOREIGN KEY("duplicateReviewedBy") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE bank_imports ADD CONSTRAINT bank_uploaded_by_fk FOREIGN KEY("uploadedBy") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE bank_imports ADD CONSTRAINT bank_confirmed_by_fk FOREIGN KEY("confirmedBy") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE bank_reconciliations ADD CONSTRAINT bank_reconciled_by_fk FOREIGN KEY("reconciledBy") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE bank_reconciliations ADD CONSTRAINT bank_undone_by_fk FOREIGN KEY("undoneBy") REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE financial_attachments ADD CONSTRAINT attachment_uploaded_by_fk FOREIGN KEY("uploadedBy") REFERENCES users(id) ON DELETE RESTRICT;
CREATE INDEX incomes_account_date_idx ON incomes("accountId",date);
CREATE INDEX expenses_account_payment_idx ON expenses("accountId","paidAt");
CREATE INDEX incomes_member_idx ON incomes("memberId");
CREATE INDEX expenses_supplier_idx ON expenses("supplierId");
ALTER TABLE privacy_requests ADD CONSTRAINT privacy_request_kind CHECK(kind IN ('EXPORT','RECTIFICATION','ANONYMIZATION')),
 ADD CONSTRAINT privacy_request_status CHECK(status IN ('PENDING','COMPLETED','REJECTED'));
ALTER TABLE privacy_retention_policies ADD CONSTRAINT privacy_retention_nonnegative CHECK(minimum_months BETWEEN 0 AND 1200);
ALTER TABLE auth_login_throttles ADD CONSTRAINT auth_failures_nonnegative CHECK(failures >= 0);

CREATE FUNCTION preserve_bank_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='bank_transactions' THEN
 IF (to_jsonb(OLD)-ARRAY['status','classification','categoryId','memberId','supplierId','contributionType','classifiedBy','associatedBy','associatedAt','duplicateReason','duplicateReviewedAt','duplicateReviewedBy','updatedAt']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','classification','categoryId','memberId','supplierId','contributionType','classifiedBy','associatedBy','associatedAt','duplicateReason','duplicateReviewedAt','duplicateReviewedBy','updatedAt']) THEN
  RAISE EXCEPTION 'Original bank movements are immutable' USING ERRCODE='23514';
 END IF;
 ELSIF TG_TABLE_NAME='bank_imports' THEN
 IF (OLD."accountId",OLD.filename,OLD."storageKey",OLD."fileHash",OLD.format,OLD.mime,OLD.size) IS DISTINCT FROM (NEW."accountId",NEW.filename,NEW."storageKey",NEW."fileHash",NEW.format,NEW.mime,NEW.size) THEN
  RAISE EXCEPTION 'Original bank files are immutable' USING ERRCODE='23514';
 END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_bank_transaction BEFORE UPDATE ON bank_transactions FOR EACH ROW EXECUTE FUNCTION preserve_bank_origin();
CREATE TRIGGER preserve_bank_import BEFORE UPDATE ON bank_imports FOR EACH ROW EXECUTE FUNCTION preserve_bank_origin();
CREATE FUNCTION preserve_financial_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."bankTransactionId" IS NOT NULL OR EXISTS(SELECT 1 FROM bank_reconciliations WHERE "incomeId"=OLD.id OR "expenseId"=OLD.id) THEN RAISE EXCEPTION 'Reconciled financial history cannot be deleted' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF OLD."bankTransactionId" IS NOT NULL AND OLD."bankTransactionId" IS DISTINCT FROM NEW."bankTransactionId" THEN RAISE EXCEPTION 'Bank origin cannot be removed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_income_history BEFORE UPDATE OR DELETE ON incomes FOR EACH ROW EXECUTE FUNCTION preserve_financial_history();
CREATE TRIGGER preserve_expense_history BEFORE UPDATE OR DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION preserve_financial_history();

CREATE FUNCTION validate_reconciliation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rec record; bank_id uuid; row_id uuid; payload jsonb;
BEGIN
 payload=to_jsonb(NEW); row_id=(payload->>'id')::uuid;
 FOR rec IN SELECT br.*,b.direction,b.amount AS bank_amount,b.date AS bank_date,b.status AS bank_status,b."categoryId" AS bank_category,b."memberId" AS bank_member,b."supplierId" AS bank_supplier,b."contributionType" AS bank_contribution,b.classification,bi."accountId" AS bank_account FROM bank_reconciliations br JOIN bank_transactions b ON b.id=br."bankTransactionId" JOIN bank_imports bi ON bi.id=b."importId" WHERE br.active AND (
  TG_TABLE_NAME='bank_reconciliations' AND br.id=row_id OR TG_TABLE_NAME='bank_transactions' AND br."bankTransactionId"=row_id OR TG_TABLE_NAME='incomes' AND br."incomeId"=row_id OR TG_TABLE_NAME='expenses' AND br."expenseId"=row_id OR TG_TABLE_NAME='contributions' AND br."incomeId"=(payload->>'incomeId')::uuid
 ) LOOP
  IF rec.bank_status<>'RECONCILED' OR (rec."incomeId" IS NOT NULL AND (rec.direction<>'CREDIT' OR rec.classification<>'INCOME' OR NOT EXISTS(SELECT 1 FROM incomes i WHERE i.id=rec."incomeId" AND i.status='COMPLETED' AND i.amount=rec.bank_amount AND i.date=rec.bank_date AND i."accountId"=rec.bank_account AND i."categoryId"=rec.bank_category AND i."memberId" IS NOT DISTINCT FROM rec.bank_member))) OR (rec."expenseId" IS NOT NULL AND (rec.direction<>'DEBIT' OR rec.classification<>'EXPENSE' OR NOT EXISTS(SELECT 1 FROM expenses e WHERE e.id=rec."expenseId" AND e.status='COMPLETED' AND e.amount=rec.bank_amount AND e.date=rec.bank_date AND e."paidAt"=rec.bank_date AND e."accountId"=rec.bank_account AND e."categoryId"=rec.bank_category AND e."supplierId" IS NOT DISTINCT FROM rec.bank_supplier))) THEN RAISE EXCEPTION 'Inconsistent active reconciliation' USING ERRCODE='23514'; END IF;
  IF rec.bank_contribution IS NOT NULL AND NOT EXISTS(SELECT 1 FROM contributions c WHERE c."incomeId"=rec."incomeId" AND c."memberId"=rec.bank_member AND c.type=rec.bank_contribution) THEN RAISE EXCEPTION 'Inconsistent reconciled contribution' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF TG_TABLE_NAME='bank_transactions' THEN bank_id=row_id; ELSIF TG_TABLE_NAME='bank_reconciliations' THEN bank_id=(payload->>'bankTransactionId')::uuid; END IF;
 IF bank_id IS NOT NULL AND EXISTS(SELECT 1 FROM bank_transactions b WHERE b.id=bank_id AND (b.status='RECONCILED') IS DISTINCT FROM EXISTS(SELECT 1 FROM bank_reconciliations r WHERE r."bankTransactionId"=b.id AND r.active)) THEN RAISE EXCEPTION 'Reconciliation state mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DO $$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['incomes','expenses','contributions','bank_transactions','bank_reconciliations'] LOOP
  EXECUTE format('CREATE CONSTRAINT TRIGGER reconciliation_integrity AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_reconciliation()',tab);
 END LOOP;
END $$;

INSERT INTO permissions(id,code,created_at) SELECT gen_random_uuid(),code,CURRENT_TIMESTAMP FROM unnest(ARRAY['AUDIT_READ','PERMISSION_MANAGE','PRIVACY_EXPORT','PRIVACY_MANAGE']) code ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='SUPER_ADMIN' AND p.code IN ('AUDIT_READ','PERMISSION_MANAGE','PRIVACY_EXPORT','PRIVACY_MANAGE') ON CONFLICT DO NOTHING;

COMMIT;
