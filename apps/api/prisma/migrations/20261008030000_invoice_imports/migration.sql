-- CreateTable
CREATE TABLE "invoice_imports" (
    "id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "storageKey" VARCHAR(36) NOT NULL,
    "fileHash" VARCHAR(64) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_invoices" (
    "id" UUID NOT NULL,
    "importId" UUID NOT NULL,
    "issuerName" VARCHAR(200) NOT NULL,
    "issuerTaxId" VARCHAR(32) NOT NULL,
    "recipientTaxId" VARCHAR(32) NOT NULL,
    "number" VARCHAR(200) NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "documentUrl" VARCHAR(2000),
    "fingerprint" VARCHAR(64) NOT NULL,
    "bankTransactionId" UUID,
    "associatedBy" UUID,
    "associatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_imports_storageKey_key" ON "invoice_imports"("storageKey");

-- CreateIndex
CREATE INDEX "invoice_imports_createdAt_idx" ON "invoice_imports"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "financial_invoices_fingerprint_key" ON "financial_invoices"("fingerprint");

-- CreateIndex
CREATE INDEX "financial_invoices_importId_idx" ON "financial_invoices"("importId");

-- CreateIndex
CREATE INDEX "financial_invoices_bankTransactionId_idx" ON "financial_invoices"("bankTransactionId");

-- CreateIndex
CREATE INDEX "financial_invoices_currency_amount_date_idx" ON "financial_invoices"("currency", "amount", "date");

-- AddForeignKey
ALTER TABLE "invoice_imports" ADD CONSTRAINT "invoice_imports_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_invoices" ADD CONSTRAINT "financial_invoices_importId_fkey" FOREIGN KEY ("importId") REFERENCES "invoice_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_invoices" ADD CONSTRAINT "financial_invoices_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_invoices" ADD CONSTRAINT "financial_invoices_associatedBy_fkey" FOREIGN KEY ("associatedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE financial_invoices ADD CONSTRAINT invoice_nonzero CHECK(amount <> 0);
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON invoice_imports FOR EACH ROW EXECUTE FUNCTION audit_change('InvoiceImport');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON financial_invoices FOR EACH ROW EXECUTE FUNCTION audit_change('FinancialInvoice');
INSERT INTO permissions(id,code,created_at) SELECT gen_random_uuid(),code,CURRENT_TIMESTAMP FROM unnest(ARRAY['FINANCE_INVOICE_READ','FINANCE_INVOICE_IMPORT','FINANCE_INVOICE_ASSOCIATE']) code ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name IN ('SUPER_ADMIN','FINANCE') AND p.code LIKE 'FINANCE_INVOICE_%' ON CONFLICT DO NOTHING;
