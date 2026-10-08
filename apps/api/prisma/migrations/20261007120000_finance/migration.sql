-- CreateEnum
CREATE TYPE "FinancialKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinancialStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContributionType" AS ENUM ('TITHE', 'OFFERING', 'DONATION', 'OTHER');

-- CreateTable
CREATE TABLE "financial_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "FinancialKind" NOT NULL,
    "parentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "bank" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "branch" VARCHAR(40),
    "account" VARCHAR(80),
    "iban" VARCHAR(34),
    "currency" CHAR(3) NOT NULL,
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "taxId" VARCHAR(40),
    "email" VARCHAR(320),
    "phone" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incomes" (
    "id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "categoryId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "origin" VARCHAR(200) NOT NULL,
    "memberId" UUID,
    "costCenter" VARCHAR(120),
    "reference" VARCHAR(200),
    "status" "FinancialStatus" NOT NULL DEFAULT 'PENDING',
    "bankTransactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "paidAt" DATE,
    "categoryId" UUID NOT NULL,
    "supplierId" UUID,
    "accountId" UUID NOT NULL,
    "costCenter" VARCHAR(120),
    "description" VARCHAR(2000) NOT NULL,
    "document" VARCHAR(200),
    "status" "FinancialStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributions" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "incomeId" UUID NOT NULL,
    "type" "ContributionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_attachments" (
    "id" UUID NOT NULL,
    "expenseId" UUID NOT NULL,
    "storageKey" VARCHAR(100) NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "mime" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_imports" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "storageKey" VARCHAR(100) NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" UUID NOT NULL,
    "importId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "reference" VARCHAR(200) NOT NULL,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_categories_parentId_idx" ON "financial_categories"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "incomes_bankTransactionId_key" ON "incomes"("bankTransactionId");

-- CreateIndex
CREATE INDEX "incomes_date_status_idx" ON "incomes"("date", "status");

-- CreateIndex
CREATE INDEX "expenses_date_status_idx" ON "expenses"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "contributions_incomeId_key" ON "contributions"("incomeId");

-- CreateIndex
CREATE INDEX "contributions_memberId_idx" ON "contributions"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_attachments_storageKey_key" ON "financial_attachments"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "bank_imports_storageKey_key" ON "bank_imports"("storageKey");

-- AddForeignKey
ALTER TABLE "financial_categories" ADD CONSTRAINT "financial_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "financial_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "financial_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "financial_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_incomeId_fkey" FOREIGN KEY ("incomeId") REFERENCES "incomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_imports" ADD CONSTRAINT "bank_imports_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_importId_fkey" FOREIGN KEY ("importId") REFERENCES "bank_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE incomes ADD CONSTRAINT income_positive CHECK (amount > 0);
ALTER TABLE expenses ADD CONSTRAINT expense_positive CHECK (amount > 0), ADD CONSTRAINT expense_payment_status CHECK ((status = 'COMPLETED') = ("paidAt" IS NOT NULL));
ALTER TABLE financial_attachments ADD CONSTRAINT attachment_size CHECK (size BETWEEN 1 AND 10485760);
INSERT INTO permissions (id,code,created_at) SELECT gen_random_uuid(),code,CURRENT_TIMESTAMP FROM unnest(ARRAY['FINANCE_TRANSACTION_READ','FINANCE_TRANSACTION_CREATE','FINANCE_TRANSACTION_UPDATE','FINANCE_CATEGORY_READ','FINANCE_CATEGORY_WRITE','FINANCE_ACCOUNT_READ','FINANCE_ACCOUNT_WRITE','FINANCE_SUPPLIER_READ','FINANCE_SUPPLIER_WRITE','FINANCE_CONTRIBUTION_WRITE','FINANCE_ATTACHMENT_READ','FINANCE_ATTACHMENT_WRITE','FINANCE_DASHBOARD_READ','FINANCE_BANK_IMPORT','FINANCE_RECONCILE','FINANCE_CONTRIBUTION_READ','FINANCE_CONTRIBUTION_EXPORT']) AS code ON CONFLICT (code) DO NOTHING;
INSERT INTO roles (id,name,created_at,updated_at) VALUES (gen_random_uuid(),'FINANCE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT (name) DO NOTHING;
INSERT INTO role_permissions (role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name IN ('FINANCE','SUPER_ADMIN') AND p.code LIKE 'FINANCE\_%' ON CONFLICT DO NOTHING;
INSERT INTO financial_categories (id,name,kind,"createdAt","updatedAt") VALUES (gen_random_uuid(),'Receitas','INCOME',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO financial_categories (id,name,kind,"parentId","createdAt","updatedAt") SELECT gen_random_uuid(),'Dízimos','INCOME',id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM financial_categories WHERE name='Receitas' AND "parentId" IS NULL;
INSERT INTO financial_categories (id,name,kind,"parentId","createdAt","updatedAt") SELECT gen_random_uuid(),'Ofertas','INCOME',id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM financial_categories WHERE name='Receitas' AND "parentId" IS NULL;
INSERT INTO financial_categories (id,name,kind,"parentId","createdAt","updatedAt") SELECT gen_random_uuid(),'Doações','INCOME',id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM financial_categories WHERE name='Receitas' AND "parentId" IS NULL;
INSERT INTO financial_categories (id,name,kind,"parentId","createdAt","updatedAt") SELECT gen_random_uuid(),'Eventos','INCOME',id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM financial_categories WHERE name='Receitas' AND "parentId" IS NULL;
INSERT INTO financial_categories (id,name,kind,"createdAt","updatedAt") VALUES (gen_random_uuid(),'Despesas','EXPENSE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO financial_categories (id,name,kind,"parentId","createdAt","updatedAt") SELECT gen_random_uuid(),'Pessoal','EXPENSE',id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM financial_categories WHERE name='Despesas' AND "parentId" IS NULL;
INSERT INTO financial_categories (id,name,kind,"parentId","createdAt","updatedAt") SELECT gen_random_uuid(),'Aluguel','EXPENSE',id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM financial_categories WHERE name='Despesas' AND "parentId" IS NULL;
INSERT INTO financial_categories (id,name,kind,"parentId","createdAt","updatedAt") SELECT gen_random_uuid(),'Energia','EXPENSE',id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM financial_categories WHERE name='Despesas' AND "parentId" IS NULL;
INSERT INTO financial_categories (id,name,kind,"parentId","createdAt","updatedAt") SELECT gen_random_uuid(),'Água','EXPENSE',id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM financial_categories WHERE name='Despesas' AND "parentId" IS NULL;
INSERT INTO financial_categories (id,name,kind,"parentId","createdAt","updatedAt") SELECT gen_random_uuid(),'Internet','EXPENSE',id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM financial_categories WHERE name='Despesas' AND "parentId" IS NULL;
INSERT INTO financial_categories (id,name,kind,"parentId","createdAt","updatedAt") SELECT gen_random_uuid(),'Manutenção','EXPENSE',id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM financial_categories WHERE name='Despesas' AND "parentId" IS NULL;
INSERT INTO financial_categories (id,name,kind,"parentId","createdAt","updatedAt") SELECT gen_random_uuid(),'Eventos','EXPENSE',id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM financial_categories WHERE name='Despesas' AND "parentId" IS NULL;
