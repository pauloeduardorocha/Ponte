-- Zero-value documents returned by e-Fatura are valid invoices.
-- Bank movements, income and expense constraints remain separate.
ALTER TABLE "financial_invoices" DROP CONSTRAINT "invoice_nonzero";
