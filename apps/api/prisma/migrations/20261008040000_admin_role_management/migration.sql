BEGIN;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name = 'ADMIN' AND p.code = 'PERMISSION_MANAGE'
ON CONFLICT DO NOTHING;

COMMIT;
