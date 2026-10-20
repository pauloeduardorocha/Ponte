-- Keep historical member IDs and account IDs so every existing relation survives.
BEGIN;
LOCK TABLE members, users IN SHARE ROW EXCLUSIVE MODE;
UPDATE members SET email = 'sememail+' || id::text || '@aponte.pt'
WHERE "anonymized_at" IS NULL AND (email IS NULL OR btrim(email) = '');
UPDATE members SET email = lower(btrim(email)) WHERE "anonymized_at" IS NULL;
-- Existing account credentials remain authoritative for already linked profiles.
UPDATE members m SET email=u.email FROM users u WHERE u.member_id=m.id AND u.deleted_at IS NULL AND m.anonymized_at IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT lower(email) FROM members WHERE anonymized_at IS NULL GROUP BY lower(email) HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Duplicate member emails: resolve before unifying accounts. No records were changed.';
  END IF;
END $$;
UPDATE users u SET member_id=m.id FROM members m
WHERE u.member_id IS NULL AND u.deleted_at IS NULL AND m.anonymized_at IS NULL
  AND lower(u.email)=lower(m.email) AND NOT EXISTS (SELECT 1 FROM users linked WHERE linked.member_id=m.id);
INSERT INTO members (id,name,email,status,created_at,updated_at)
SELECT gen_random_uuid(),u.name,u.email,'ACTIVE',u.created_at,now() FROM users u
WHERE u.member_id IS NULL AND u.deleted_at IS NULL;
UPDATE users u SET member_id=m.id FROM members m
WHERE u.member_id IS NULL AND u.deleted_at IS NULL AND m.anonymized_at IS NULL AND lower(u.email)=lower(m.email);
INSERT INTO users (id,name,email,password_hash,status,member_id,created_at,updated_at)
SELECT gen_random_uuid(),m.name,m.email,'$argon2id$v=19$m=65536,t=3,p=4$3I1mJbHaOG4w5SvV4clR6A$c3Ps9wNwrUVowaCh/pXVfQ2j+M/iygsmBn8JBM7oew8',
  CASE WHEN m.status='ACTIVE' THEN 'ACTIVE'::"UserStatus" ELSE 'DISABLED'::"UserStatus" END,m.id,m.created_at,now()
FROM members m WHERE m.anonymized_at IS NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.member_id=m.id);
UPDATE users u SET name=m.name FROM members m WHERE u.member_id=m.id AND u.deleted_at IS NULL;
CREATE UNIQUE INDEX members_email_identity_unique ON members (lower(email)) WHERE anonymized_at IS NULL;
ALTER TABLE members ADD CONSTRAINT member_email_required CHECK (anonymized_at IS NOT NULL OR (email IS NOT NULL AND btrim(email) <> ''));
-- Deferred lifecycle hooks also cover imports, seeds and future creation paths.
CREATE FUNCTION ensure_member_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m members%ROWTYPE;
BEGIN
  SELECT * INTO m FROM members WHERE id=NEW.id;
  IF NOT FOUND OR m.anonymized_at IS NOT NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE member_id=m.id) THEN
    INSERT INTO users(id,name,email,password_hash,status,member_id,created_at,updated_at)
    VALUES(gen_random_uuid(),m.name,m.email,'$argon2id$v=19$m=65536,t=3,p=4$3I1mJbHaOG4w5SvV4clR6A$c3Ps9wNwrUVowaCh/pXVfQ2j+M/iygsmBn8JBM7oew8',CASE WHEN m.status='ACTIVE' THEN 'ACTIVE'::"UserStatus" ELSE 'DISABLED'::"UserStatus" END,m.id,now(),now());
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER member_identity AFTER INSERT OR UPDATE ON members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_member_identity();
CREATE FUNCTION ensure_user_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE u users%ROWTYPE; mid uuid;
BEGIN
  SELECT * INTO u FROM users WHERE id=NEW.id;
  IF NOT FOUND OR u.deleted_at IS NOT NULL THEN RETURN NULL; END IF;
  IF u.member_id IS NULL THEN
    IF TG_OP='UPDATE' AND OLD.member_id IS NOT NULL THEN
      RAISE EXCEPTION 'An account cannot be detached from its member';
    END IF;
    INSERT INTO members(id,name,email,status,created_at,updated_at) VALUES(gen_random_uuid(),u.name,u.email,'ACTIVE',now(),now()) RETURNING id INTO mid;
    UPDATE users SET member_id=mid WHERE id=u.id;
  END IF;
  IF TG_OP='UPDATE' AND OLD.member_id IS NOT NULL AND OLD.member_id IS DISTINCT FROM u.member_id THEN
    RAISE EXCEPTION 'An account cannot change its member';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER user_identity AFTER INSERT OR UPDATE ON users DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ensure_user_identity();
CREATE FUNCTION sync_member_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.anonymized_at IS NULL THEN
    UPDATE users SET name=NEW.name,email=NEW.email,updated_at=now()
    WHERE member_id=NEW.id AND deleted_at IS NULL AND (name IS DISTINCT FROM NEW.name OR email IS DISTINCT FROM NEW.email);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sync_member_identity AFTER UPDATE OF name,email ON members FOR EACH ROW EXECUTE FUNCTION sync_member_identity();
CREATE FUNCTION fill_member_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.anonymized_at IS NULL THEN
    NEW.email := lower(COALESCE(NULLIF(btrim(NEW.email),''), 'sememail+' || NEW.id::text || '@aponte.pt'));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fill_member_email BEFORE INSERT OR UPDATE OF email ON members FOR EACH ROW EXECUTE FUNCTION fill_member_email();
CREATE FUNCTION sync_user_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deleted_at IS NULL AND NEW.member_id IS NOT NULL THEN
    UPDATE members SET name=NEW.name,email=NEW.email,updated_at=now()
    WHERE id=NEW.member_id AND anonymized_at IS NULL AND (name IS DISTINCT FROM NEW.name OR email IS DISTINCT FROM NEW.email);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sync_user_identity AFTER UPDATE OF name,email ON users FOR EACH ROW EXECUTE FUNCTION sync_user_identity();
COMMIT;
