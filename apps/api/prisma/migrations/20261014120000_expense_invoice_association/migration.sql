ALTER TABLE "financial_invoices" ADD COLUMN "expenseId" UUID;
ALTER TABLE "financial_invoices" ADD CONSTRAINT "financial_invoices_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "financial_invoices_expenseId_idx" ON "financial_invoices"("expenseId");
ALTER TABLE "financial_invoices" ADD CONSTRAINT "financial_invoices_single_target" CHECK ("expenseId" IS NULL OR "bankTransactionId" IS NULL);
