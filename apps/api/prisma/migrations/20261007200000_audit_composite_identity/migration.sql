CREATE OR REPLACE FUNCTION audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_data jsonb; new_data jsonb; key text; payload jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN old_data=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_data=to_jsonb(NEW); END IF;
 IF TG_OP='UPDATE' AND old_data IS NOT DISTINCT FROM new_data THEN RETURN NEW; END IF;
 payload=coalesce(new_data,old_data);
 key=coalesce(payload->>'id',payload->>'data_class',
  CASE WHEN TG_ARGV[0]='UserRole' THEN concat_ws('/',payload->>'user_id',payload->>'role_id')
       WHEN TG_ARGV[0]='RolePermission' THEN concat_ws('/',payload->>'role_id',payload->>'permission_id') END);
 INSERT INTO audit_logs(id,action,entity_type,entity_id,old_values,new_values,created_at) VALUES(gen_random_uuid(),'DATA_'||TG_ARGV[0]||'_'||TG_OP,TG_ARGV[0],key,old_data,new_data,clock_timestamp());
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
