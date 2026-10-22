-- Extend the current library; existing cover, circulation and catalogue fields remain.
ALTER TYPE "CopyStatus" ADD VALUE 'PENDING_INVENTORY';
ALTER TABLE library_books
  ADD COLUMN "registrationNumber" VARCHAR(32),
  ADD COLUMN collection VARCHAR(200),
  ADD COLUMN "catalogueNotes" TEXT,
  ALTER COLUMN author DROP NOT NULL;
CREATE UNIQUE INDEX "library_books_registrationNumber_key" ON library_books("registrationNumber");
ALTER TABLE library_copies ADD COLUMN shelfmark VARCHAR(100);
CREATE TABLE library_categories (
 id UUID PRIMARY KEY, code VARCHAR(3) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL,
 "parentCode" VARCHAR(3) REFERENCES library_categories(code) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT library_categories_code_format CHECK (code ~ '^[0-9]{2,3}$'),
 CONSTRAINT library_categories_not_own_parent CHECK (code IS DISTINCT FROM "parentCode")
);
CREATE TABLE library_book_categories (
 id UUID PRIMARY KEY,
 "bookId" UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "categoryCode" VARCHAR(3) NOT NULL REFERENCES library_categories(code) ON DELETE RESTRICT ON UPDATE CASCADE,
 "isPrimary" BOOLEAN NOT NULL DEFAULT false, "reviewedAt" TIMESTAMPTZ(6),
 CONSTRAINT "library_book_categories_bookId_categoryCode_key" UNIQUE ("bookId", "categoryCode")
);
CREATE INDEX "library_book_categories_categoryCode_bookId_idx" ON library_book_categories("categoryCode", "bookId");
CREATE UNIQUE INDEX library_book_categories_one_primary ON library_book_categories("bookId") WHERE "isPrimary";
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON library_categories FOR EACH ROW EXECUTE FUNCTION audit_change('LibraryCategory');
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON library_book_categories FOR EACH ROW EXECUTE FUNCTION audit_change('BookCategory');
