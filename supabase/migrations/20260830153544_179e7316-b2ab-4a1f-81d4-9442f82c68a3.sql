REVOKE EXECUTE ON FUNCTION public.current_household_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_role_is_owner() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_household_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_role_is_owner() TO authenticated, service_role;