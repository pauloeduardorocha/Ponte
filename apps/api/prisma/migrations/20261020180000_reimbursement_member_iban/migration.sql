ALTER TABLE "members" ADD COLUMN "iban" VARCHAR(34);
-- Existing telephone contacts are not bank account numbers. Preserve them as legacy data.
ALTER TABLE "reimbursements" ADD COLUMN "iban" VARCHAR(34) NOT NULL DEFAULT '';
