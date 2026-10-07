-- CreateEnum
CREATE TYPE "CopyStatus" AS ENUM ('AVAILABLE', 'LOANED', 'RESERVED', 'MAINTENANCE', 'LOST', 'DISPOSED');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'RETURNED', 'OVERDUE', 'LOST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('WAITING', 'READY', 'FULFILLED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FineStatus" AS ENUM ('OPEN', 'PAID', 'FORGIVEN', 'CANCELLED');


-- CreateTable
CREATE TABLE "library_books" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "subtitle" VARCHAR(200),
    "author" VARCHAR(200) NOT NULL,
    "isbn" VARCHAR(32),
    "publisher" VARCHAR(200),
    "edition" VARCHAR(80),
    "year" INTEGER,
    "language" VARCHAR(80) NOT NULL DEFAULT 'pt',
    "description" TEXT,
    "pages" INTEGER,
    "cover" VARCHAR(2000),
    "category" VARCHAR(120),
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "library_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_copies" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "assetCode" VARCHAR(100) NOT NULL,
    "barcode" VARCHAR(100),
    "qrCode" VARCHAR(200),
    "condition" VARCHAR(120) NOT NULL DEFAULT 'GOOD',
    "location" VARCHAR(200) NOT NULL,
    "status" "CopyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "acquiredAt" TIMESTAMPTZ(6),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "library_copies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_loans" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "bookCopyId" UUID NOT NULL,
    "borrowedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMPTZ(6) NOT NULL,
    "returnedAt" TIMESTAMPTZ(6),
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "renewedCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" UUID NOT NULL,
    "returnedBy" UUID,
    "observations" TEXT,
    "graceDays" INTEGER NOT NULL,
    "dailyFine" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "library_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "defaultLoanDays" INTEGER NOT NULL DEFAULT 14,
    "maxBooks" INTEGER NOT NULL DEFAULT 3,
    "maxRenewals" INTEGER NOT NULL DEFAULT 2,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "dailyFine" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "blockOverdue" BOOLEAN NOT NULL DEFAULT true,
    "holdDays" INTEGER NOT NULL DEFAULT 2,
    "reservationDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "library_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_fines" (
    "id" UUID NOT NULL,
    "loanId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "FineStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "library_fines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_fine_payments" (
    "id" UUID NOT NULL,
    "fineId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_fine_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_fine_adjustments" (
    "id" UUID NOT NULL,
    "fineId" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "justification" VARCHAR(2000) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_fine_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_reservations" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "bookCopyId" UUID,
    "status" "ReservationStatus" NOT NULL DEFAULT 'WAITING',
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "readyAt" TIMESTAMPTZ(6),
    "holdUntil" TIMESTAMPTZ(6),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "library_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "library_books_isbn_key" ON "library_books"("isbn");

-- CreateIndex
CREATE INDEX "library_books_category_title_idx" ON "library_books"("category", "title");

-- CreateIndex
CREATE UNIQUE INDEX "library_copies_assetCode_key" ON "library_copies"("assetCode");

-- CreateIndex
CREATE UNIQUE INDEX "library_copies_barcode_key" ON "library_copies"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "library_copies_qrCode_key" ON "library_copies"("qrCode");

-- CreateIndex
CREATE INDEX "library_copies_bookId_status_idx" ON "library_copies"("bookId", "status");

-- CreateIndex
CREATE INDEX "library_loans_memberId_status_idx" ON "library_loans"("memberId", "status");

-- CreateIndex
CREATE INDEX "library_loans_status_dueAt_idx" ON "library_loans"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "library_fines_loanId_key" ON "library_fines"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "library_fine_payments_idempotencyKey_key" ON "library_fine_payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "library_reservations_bookId_status_createdAt_idx" ON "library_reservations"("bookId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "library_copies" ADD CONSTRAINT "library_copies_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "library_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_bookCopyId_fkey" FOREIGN KEY ("bookCopyId") REFERENCES "library_copies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fines_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "library_loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fine_payments" ADD CONSTRAINT "library_fine_payments_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "library_fines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fine_adjustments" ADD CONSTRAINT "library_fine_adjustments_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "library_fines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "library_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_reservations" ADD CONSTRAINT "library_reservations_bookCopyId_fkey" FOREIGN KEY ("bookCopyId") REFERENCES "library_copies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense in depth: limits and allocation are serialized by the service;
-- these invariants also survive accidental writes outside it.
CREATE UNIQUE INDEX "library_one_active_loan_per_copy"
ON "library_loans" ("bookCopyId") WHERE "status" IN ('ACTIVE', 'OVERDUE');
CREATE UNIQUE INDEX "library_one_active_reservation_per_member_book"
ON "library_reservations" ("bookId", "memberId") WHERE "status" IN ('WAITING', 'READY');
CREATE UNIQUE INDEX "library_one_ready_hold_per_copy"
ON "library_reservations" ("bookCopyId") WHERE "status" = 'READY';
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fine_money_check"
CHECK ("amount" >= 0 AND "paidAmount" >= 0 AND "discount" >= 0 AND "paidAmount" + "discount" <= "amount");
ALTER TABLE "library_fine_payments" ADD CONSTRAINT "library_payment_positive" CHECK ("amount" > 0);
ALTER TABLE "library_fine_adjustments" ADD CONSTRAINT "library_adjustment_check"
CHECK ("amount" > 0 AND length(trim("justification")) > 0 AND "kind" IN ('DISCOUNT', 'FORGIVE', 'CANCEL'));
ALTER TABLE "library_settings" ADD CONSTRAINT "library_settings_check"
CHECK ("id" = 1 AND "defaultLoanDays" > 0 AND "maxBooks" > 0 AND "maxRenewals" >= 0 AND "graceDays" >= 0 AND "dailyFine" >= 0 AND "holdDays" > 0 AND "reservationDays" > 0);
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loan_check"
CHECK ("renewedCount" >= 0 AND "graceDays" >= 0 AND "dailyFine" >= 0);
