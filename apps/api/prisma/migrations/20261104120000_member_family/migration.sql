BEGIN;
ALTER TABLE members ADD COLUMN without_account BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE members DROP CONSTRAINT member_email_required;
ALTER TABLE members ADD CONSTRAINT member_email_required CHECK (
  without_account OR anonymized_at IS NOT NULL OR (email IS NOT NULL AND btrim(email) <> '')
);

CREATE OR REPLACE FUNCTION ensure_member_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m members%ROWTYPE;
BEGIN
  SELECT * INTO m FROM members WHERE id=NEW.id;
  IF NOT FOUND OR m.anonymized_at IS NOT NULL OR m.without_account THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE member_id=m.id) THEN
    INSERT INTO users(id,name,email,password_hash,status,member_id,created_at,updated_at)
    VALUES(gen_random_uuid(),m.name,m.email,'$argon2id$v=19$m=65536,t=3,p=4$3I1mJbHaOG4w5SvV4clR6A$c3Ps9wNwrUVowaCh/pXVfQ2j+M/iygsmBn8JBM7oew8',CASE WHEN m.status='ACTIVE' THEN 'ACTIVE'::"UserStatus" ELSE 'DISABLED'::"UserStatus" END,m.id,now(),now());
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION fill_member_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.anonymized_at IS NULL THEN
    NEW.email := lower(NULLIF(btrim(NEW.email),''));
    IF NEW.email IS NULL AND NOT NEW.without_account THEN
      NEW.email := 'sememail+' || NEW.id::text || '@aponte.pt';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TYPE "FamilyRelation" AS ENUM ('FATHER', 'MOTHER', 'CHILD', 'SPOUSE');
CREATE TABLE member_relationships (
  id UUID NOT NULL PRIMARY KEY,
  first_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE ON UPDATE CASCADE,
  second_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE ON UPDATE CASCADE,
  first_role "FamilyRelation" NOT NULL,
  second_role "FamilyRelation" NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT family_order CHECK (first_id < second_id),
  CONSTRAINT family_roles CHECK (
    (first_role='SPOUSE' AND second_role='SPOUSE') OR
    (first_role IN ('FATHER','MOTHER') AND second_role='CHILD') OR
    (second_role IN ('FATHER','MOTHER') AND first_role='CHILD')
  )
);
CREATE UNIQUE INDEX member_relationships_first_id_second_id_key ON member_relationships(first_id,second_id);
CREATE INDEX member_relationships_second_id_idx ON member_relationships(second_id);
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON member_relationships
  FOR EACH ROW EXECUTE FUNCTION audit_change('MemberRelationship');
REVOKE ALL ON member_relationships FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON member_relationships TO church_runtime;
COMMIT;
