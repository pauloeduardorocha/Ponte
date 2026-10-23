-- Operator-authorized curation: approve all current category proposals and mark copies new.
-- One atomic statement. Keep before-values in the immutable audit log.
WITH context AS MATERIALIZED (
  SELECT set_config('app.audit_agent','library-curation-v1',true)
), old_categories AS MATERIALIZED (
  SELECT id,"bookId","categoryCode","reviewedAt" FROM library_book_categories
  WHERE "reviewedAt" IS NULL FOR UPDATE
), old_copies AS MATERIALIZED (
  SELECT id,condition,"updatedAt" FROM library_copies WHERE condition IS DISTINCT FROM 'NEW' FOR UPDATE
), categories AS (
  UPDATE library_book_categories c SET "reviewedAt"=now()
  FROM old_categories old,context WHERE c.id=old.id RETURNING c.id
), copies AS (
  UPDATE library_copies c SET condition='NEW',"updatedAt"=now()
  FROM old_copies old,context WHERE c.id=old.id RETURNING c.id
), audit AS (
  INSERT INTO audit_logs(id,action,entity_type,entity_id,metadata)
  SELECT gen_random_uuid(),'LIBRARY_CURATION','LibraryCatalogue','category-approval-new-condition-20261022',
    jsonb_build_object('categoriesValidated',(SELECT count(*) FROM categories),
      'copiesMarkedNew',(SELECT count(*) FROM copies),
      'previousCategories',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM old_categories x),'[]'::jsonb),
      'previousCopies',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM old_copies x),'[]'::jsonb))
  RETURNING id
)
SELECT (SELECT count(*) FROM categories)::int AS categories_validated,
  (SELECT count(*) FROM copies)::int AS copies_marked_new,
  (SELECT id FROM audit) AS audit_id;
