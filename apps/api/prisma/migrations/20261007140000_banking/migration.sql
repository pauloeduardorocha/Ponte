-- CreateEnum
CREATE TYPE "BankImportStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'READY_FOR_REVIEW', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "BankDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "BankTransactionStatus" AS ENUM ('PENDING_REVIEW', 'CLASSIFIED', 'RECONCILED', 'REJECTED', 'POSSIBLE_DUPLICATE');

-- CreateEnum
CREATE TYPE "BankClassification" AS ENUM ('INCOME', 'EXPENSE', 'IGNORE');

-- DropIndex
DROP INDEX "incomes_bankTransactionId_key";

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "bankTransactionId" UUID;

-- AlterTable
ALTER TABLE "bank_imports" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedBy" UUID,
ADD COLUMN     "error" VARCHAR(2000),
ADD COLUMN     "fileHash" VARCHAR(64),
ADD COLUMN     "format" VARCHAR(10),
ADD COLUMN     "mime" VARCHAR(100),
ADD COLUMN     "size" INTEGER,
ADD COLUMN     "status" "BankImportStatus" NOT NULL DEFAULT 'UPLOADED',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "uploadedBy" UUID;

-- AlterTable
ALTER TABLE "bank_transactions" ADD COLUMN     "associatedAt" TIMESTAMP(3),
ADD COLUMN     "associatedBy" UUID,
ADD COLUMN     "bankIdentifier" VARCHAR(200),
ADD COLUMN     "categoryId" UUID,
ADD COLUMN     "classification" "BankClassification",
ADD COLUMN     "classifiedBy" UUID,
ADD COLUMN     "contributionType" "ContributionType",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" VARCHAR(2000) NOT NULL DEFAULT '',
ADD COLUMN     "direction" "BankDirection" NOT NULL DEFAULT 'CREDIT',
ADD COLUMN     "duplicateReason" VARCHAR(500),
ADD COLUMN     "duplicateReviewedAt" TIMESTAMP(3),
ADD COLUMN     "duplicateReviewedBy" UUID,
ADD COLUMN     "fingerprint" VARCHAR(64),
ADD COLUMN     "memberId" UUID,
ADD COLUMN     "rowNumber" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "BankTransactionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
ADD COLUMN     "supplierId" UUID,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "bank_reconciliations" (
    "id" UUID NOT NULL,
    "bankTransactionId" UUID NOT NULL,
    "incomeId" UUID,
    "expenseId" UUID,
    "createdLedger" BOOLEAN NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reconciledBy" UUID NOT NULL,
    "reconciledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneBy" UUID,
    "undoneAt" TIMESTAMP(3),
    "undoReason" VARCHAR(500),

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_reconciliations_bankTransactionId_active_idx" ON "bank_reconciliations"("bankTransactionId", "active");

-- CreateIndex
CREATE INDEX "bank_transactions_fingerprint_idx" ON "bank_transactions"("fingerprint");

-- CreateIndex
CREATE INDEX "bank_transactions_importId_status_idx" ON "bank_transactions"("importId", "status");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_incomeId_fkey" FOREIGN KEY ("incomeId") REFERENCES "incomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX bank_active_reconciliation ON bank_reconciliations ("bankTransactionId") WHERE active;
CREATE UNIQUE INDEX bank_active_income ON bank_reconciliations ("incomeId") WHERE active AND "incomeId" IS NOT NULL;
CREATE UNIQUE INDEX bank_active_expense ON bank_reconciliations ("expenseId") WHERE active AND "expenseId" IS NOT NULL;
ALTER TABLE bank_reconciliations ADD CONSTRAINT bank_one_ledger CHECK (("incomeId" IS NOT NULL)::int + ("expenseId" IS NOT NULL)::int = 1);
ALTER TABLE bank_transactions ADD CONSTRAINT bank_nonzero CHECK (amount <> 0);
UPDATE bank_transactions SET direction = CASE WHEN amount < 0 THEN 'DEBIT'::"BankDirection" ELSE 'CREDIT'::"BankDirection" END, amount = abs(amount);
ALTER TABLE bank_transactions ADD CONSTRAINT bank_positive CHECK (amount > 0);
