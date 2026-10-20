CREATE TABLE "reimbursements" (
  "id" UUID NOT NULL,
  "submittedBy" UUID,
  "beneficiaryName" VARCHAR(120) NOT NULL DEFAULT '',
  "contact" VARCHAR(120) NOT NULL DEFAULT '',
  "purpose" VARCHAR(2000) NOT NULL DEFAULT '',
  "amount" DECIMAL(14,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "paidAt" DATE,
  "bankTransactionId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reimbursements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reimbursements_positive_amount" CHECK ("amount" IS NULL OR "amount" > 0),
  CONSTRAINT "reimbursements_paid_before_link" CHECK ("bankTransactionId" IS NULL OR "paidAt" IS NOT NULL),
  CONSTRAINT "reimbursements_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reimbursements_bankTransactionId_key" ON "reimbursements"("bankTransactionId");
CREATE INDEX "reimbursements_submittedBy_createdAt_idx" ON "reimbursements"("submittedBy", "createdAt");
CREATE INDEX "reimbursements_paidAt_createdAt_idx" ON "reimbursements"("paidAt", "createdAt");
CREATE TABLE "reimbursement_attachments" (
  "id" UUID NOT NULL,
  "reimbursementId" UUID NOT NULL,
  "storageKey" VARCHAR(100) NOT NULL,
  "filename" VARCHAR(255) NOT NULL,
  "mime" VARCHAR(100) NOT NULL,
  "size" INTEGER NOT NULL,
  "kind" VARCHAR(20) NOT NULL DEFAULT 'DOCUMENT',
  "hash" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reimbursement_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reimbursement_attachments_kind_check" CHECK ("kind" IN ('DOCUMENT', 'PAYMENT')),
  CONSTRAINT "reimbursement_attachments_reimbursementId_fkey" FOREIGN KEY ("reimbursementId") REFERENCES "reimbursements"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reimbursement_attachments_storageKey_key" ON "reimbursement_attachments"("storageKey");
CREATE INDEX "reimbursement_attachments_reimbursementId_idx" ON "reimbursement_attachments"("reimbursementId");
CREATE INDEX "reimbursement_attachments_hash_idx" ON "reimbursement_attachments"("hash");
