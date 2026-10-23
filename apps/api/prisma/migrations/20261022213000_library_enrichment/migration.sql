-- Provisional bibliographic research and its alternatives, preserved for curation.
CREATE TABLE "library_book_enrichments" (
  "bookId" UUID NOT NULL,
  "sourceHash" VARCHAR(64) NOT NULL,
  "research" JSONB NOT NULL,
  "selection" JSONB NOT NULL,
  "previousValues" JSONB NOT NULL,
  "importedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMPTZ(6),
  CONSTRAINT "library_book_enrichments_pkey" PRIMARY KEY ("bookId"),
  CONSTRAINT "library_book_enrichments_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "library_books"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
REVOKE ALL ON "library_book_enrichments" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON "library_book_enrichments" TO church_runtime;
