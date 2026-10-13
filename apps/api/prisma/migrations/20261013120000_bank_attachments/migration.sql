CREATE TABLE "bank_attachments" (
  "id" UUID NOT NULL,
  "transactionId" UUID NOT NULL,
  "storageKey" VARCHAR(100) NOT NULL,
  "filename" VARCHAR(255) NOT NULL,
  "mime" VARCHAR(100) NOT NULL,
  "size" INTEGER NOT NULL CHECK ("size" BETWEEN 1 AND 1048576),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bank_attachments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "bank_attachments_storageKey_key" ON "bank_attachments"("storageKey");
CREATE INDEX "bank_attachments_transactionId_idx" ON "bank_attachments"("transactionId");
