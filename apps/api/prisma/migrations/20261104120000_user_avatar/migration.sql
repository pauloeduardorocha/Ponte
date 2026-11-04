ALTER TABLE "users" ADD COLUMN "avatar" TEXT;
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_size" CHECK (octet_length("avatar") <= 666691);

-- Avoid duplicating photo payloads in audit history.
CREATE OR REPLACE FUNCTION audit_clean(value jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb; item record;
BEGIN
 IF value IS NULL THEN RETURN NULL; END IF;
 IF jsonb_typeof(value)='object' THEN
  result='{}'::jsonb;
  FOR item IN SELECT j.k AS key, j.v FROM jsonb_each(value) AS j(k,v) LOOP
   IF lower(item.key) NOT IN ('avatar','password','passwordhash','password_hash','currentpassword','newpassword','token','tokenhash','token_hash','accesstoken','refreshtoken','storagekey','storage_key') THEN
    IF item.key IN ('amount','openingBalance','dailyFine','paidAmount','amountPaid','opening_balance','daily_fine','paid_amount') AND jsonb_typeof(item.v)='number' THEN result=result||jsonb_build_object(item.key,to_jsonb(item.v#>>'{}')); ELSE result=result||jsonb_build_object(item.key,audit_clean(item.v)); END IF;
   END IF;
  END LOOP;
  RETURN result;
 ELSIF jsonb_typeof(value)='array' THEN
  SELECT coalesce(jsonb_agg(audit_clean(v)),'[]'::jsonb) INTO result FROM jsonb_array_elements(value) v;
  RETURN result;
 ELSIF jsonb_typeof(value)='number' THEN RETURN value;
 ELSE RETURN value;
 END IF;
END $$;
