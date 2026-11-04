-- =====================================================================
-- EGC Builder: Mobile App Access Permission Seed
-- =====================================================================
-- This script safely seeds the official company-wide permission for
-- mobile app login access ('mobile_app_access').
-- 
-- Default Policy: ALLOW BY DEFAULT (مسموح للجميع كأصل)
-- 1. Inserts 'mobile_app_access' into permission_catalog as unscoped (company-wide).
-- 2. Grants 'mobile_app_access' to ALL existing roles in role_permission_grants.
-- 3. Attaches a trigger to auto-grant 'mobile_app_access' to any newly created role.
--
-- Result:
-- - All current and future users can enter the mobile app normally.
-- - Only explicit individual bans via user_permission_grants (allowed = false)
--   from the Desktop Settings page will block an engineer.
-- =====================================================================

-- 1. Register the permission in permission_catalog
INSERT INTO permission_catalog (
  name,
  area,
  description,
  is_project_scoped,
  is_active
)
VALUES (
  'mobile_app_access',
  'Admin',
  'السماح بتسجيل الدخول إلى تطبيق الهاتف EGC Builder',
  false, -- Global / Unscoped so it does not require a projectId
  true
)
ON CONFLICT (name) DO UPDATE SET
  area = 'Admin',
  description = 'السماح بتسجيل الدخول إلى تطبيق الهاتف EGC Builder',
  is_project_scoped = false,
  is_active = true;

-- 2. Grant to all current roles (Allow by Default)
INSERT INTO role_permission_grants (
  role_id,
  permission_id,
  allowed,
  scope
)
SELECT 
  r.id AS role_id,
  p.id AS permission_id,
  true AS allowed,
  'all_projects'::grant_scope AS scope
FROM roles r
CROSS JOIN permission_catalog p
WHERE p.name = 'mobile_app_access'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  allowed = true,
  scope = 'all_projects'::grant_scope;

-- 3. Automatic trigger for any future role created
CREATE OR REPLACE FUNCTION auto_grant_mobile_access_new_role()
RETURNS trigger AS $$
BEGIN
  INSERT INTO role_permission_grants (role_id, permission_id, allowed, scope)
  SELECT 
    NEW.id,
    p.id,
    true,
    'all_projects'::grant_scope
  FROM permission_catalog p
  WHERE p.name = 'mobile_app_access'
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_grant_mobile_access_new_role ON roles;
CREATE TRIGGER trg_auto_grant_mobile_access_new_role
AFTER INSERT ON roles
FOR EACH ROW
EXECUTE FUNCTION auto_grant_mobile_access_new_role();

