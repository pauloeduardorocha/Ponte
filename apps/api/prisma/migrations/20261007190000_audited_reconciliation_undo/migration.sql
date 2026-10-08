BEGIN;
CREATE OR REPLACE FUNCTION preserve_financial_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."bankTransactionId" IS NOT NULL OR EXISTS(SELECT 1 FROM bank_reconciliations WHERE "incomeId"=OLD.id OR "expenseId"=OLD.id) THEN RAISE EXCEPTION 'Reconciled financial history cannot be deleted' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF OLD."bankTransactionId" IS NOT NULL AND OLD."bankTransactionId" IS DISTINCT FROM NEW."bankTransactionId" THEN
  IF NEW."bankTransactionId" IS NOT NULL OR NOT EXISTS(
   SELECT 1 FROM bank_reconciliations r WHERE r."bankTransactionId"=OLD."bankTransactionId" AND (r."incomeId"=OLD.id OR r."expenseId"=OLD.id)
   AND NOT r.active AND NOT r."createdLedger" AND r."undoneBy" IS NOT NULL AND r."undoneAt" IS NOT NULL AND length(trim(r."undoReason"))>0
  ) OR EXISTS(SELECT 1 FROM bank_reconciliations r WHERE r.active AND (r."incomeId"=OLD.id OR r."expenseId"=OLD.id)) THEN
   RAISE EXCEPTION 'Bank origin cannot be removed without recorded undo' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION contribution_member_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payload jsonb;
BEGIN
 payload=to_jsonb(NEW);
 IF EXISTS(SELECT 1 FROM contributions c JOIN incomes i ON i.id=c."incomeId" WHERE
  (TG_TABLE_NAME='contributions' AND c.id=(payload->>'id')::uuid OR TG_TABLE_NAME='incomes' AND i.id=(payload->>'id')::uuid)
  AND i."memberId" IS DISTINCT FROM c."memberId") THEN
  RAISE EXCEPTION 'Contribution member must match income' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER income_contribution_member AFTER INSERT OR UPDATE ON incomes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION contribution_member_integrity();
CREATE CONSTRAINT TRIGGER contribution_member AFTER INSERT OR UPDATE ON contributions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION contribution_member_integrity();
COMMIT;
