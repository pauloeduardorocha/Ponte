-- Cost centers are classification metadata; preserve the original statement fields.
CREATE OR REPLACE FUNCTION preserve_bank_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='bank_transactions' THEN
 IF (to_jsonb(OLD)-ARRAY['status','classification','categoryId','costCenterId','memberId','supplierId','contributionType','classifiedBy','associatedBy','associatedAt','duplicateReason','duplicateReviewedAt','duplicateReviewedBy','updatedAt']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','classification','categoryId','costCenterId','memberId','supplierId','contributionType','classifiedBy','associatedBy','associatedAt','duplicateReason','duplicateReviewedAt','duplicateReviewedBy','updatedAt']) THEN
  RAISE EXCEPTION 'Original bank movements are immutable' USING ERRCODE='23514';
 END IF;
 ELSIF TG_TABLE_NAME='bank_imports' THEN
 IF (OLD."accountId",OLD.filename,OLD."storageKey",OLD."fileHash",OLD.format,OLD.mime,OLD.size) IS DISTINCT FROM (NEW."accountId",NEW.filename,NEW."storageKey",NEW."fileHash",NEW.format,NEW.mime,NEW.size) THEN
  RAISE EXCEPTION 'Original bank files are immutable' USING ERRCODE='23514';
 END IF;
 END IF;
 RETURN NEW;
END $$;
