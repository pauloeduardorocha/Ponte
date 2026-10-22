ALTER TABLE "reimbursements" ADD COLUMN "categoryId" UUID;
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "financial_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
