BEGIN;
LOCK TABLE financial_invoices, expenses IN SHARE ROW EXCLUSIVE MODE;
-- Refuse to discard a link if its expense cannot be determined uniquely.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM financial_invoices i
    WHERE i."bankTransactionId" IS NOT NULL
      AND (SELECT count(*) FROM expenses e WHERE e."bankTransactionId" = i."bankTransactionId") <> 1
  ) THEN
    RAISE EXCEPTION 'Invoice bank links require exactly one matching expense before migration';
  END IF;
END $$;
UPDATE financial_invoices i
SET "expenseId" = e.id, "bankTransactionId" = NULL
FROM expenses e
WHERE i."bankTransactionId" = e."bankTransactionId";
ALTER TABLE financial_invoices DROP CONSTRAINT financial_invoices_single_target;
ALTER TABLE financial_invoices DROP COLUMN "bankTransactionId";
COMMIT;
