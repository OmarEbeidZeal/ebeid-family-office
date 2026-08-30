-- Move the two row-level-security helper functions out of the API-exposed
-- schema. RLS policies keep working (dependencies follow the function, not the
-- name), but the helpers are no longer callable through the Data API.
CREATE SCHEMA IF NOT EXISTS private;

GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.current_household_id() SET SCHEMA private;
ALTER FUNCTION public.current_role_is_owner() SET SCHEMA private;

REVOKE ALL ON FUNCTION private.current_household_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_role_is_owner() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.current_household_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_role_is_owner() TO authenticated, service_role;