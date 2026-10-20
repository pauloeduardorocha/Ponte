ALTER TABLE "reimbursements" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "reimbursements_deletedAt_createdAt_idx" ON "reimbursements"("deletedAt", "createdAt");
