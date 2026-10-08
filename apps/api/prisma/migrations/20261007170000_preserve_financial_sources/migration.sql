BEGIN;
CREATE FUNCTION preserve_source_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Bank source and reconciliation history must be retained' USING ERRCODE='23514';
END $$;
CREATE TRIGGER preserve_bank_source_delete BEFORE DELETE ON bank_transactions FOR EACH ROW EXECUTE FUNCTION preserve_source_delete();
CREATE TRIGGER preserve_bank_file_delete BEFORE DELETE ON bank_imports FOR EACH ROW EXECUTE FUNCTION preserve_source_delete();
CREATE TRIGGER preserve_reconciliation_delete BEFORE DELETE ON bank_reconciliations FOR EACH ROW EXECUTE FUNCTION preserve_source_delete();

CREATE FUNCTION preserve_contribution_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM bank_reconciliations r WHERE r."incomeId"=OLD."incomeId") THEN
   RAISE EXCEPTION 'Reconciled contribution history must be retained' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD."incomeId" IS DISTINCT FROM NEW."incomeId" THEN
  RAISE EXCEPTION 'Contribution origin cannot be replaced' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_contribution_origin BEFORE UPDATE OR DELETE ON contributions FOR EACH ROW EXECUTE FUNCTION preserve_contribution_identity();
COMMIT;
