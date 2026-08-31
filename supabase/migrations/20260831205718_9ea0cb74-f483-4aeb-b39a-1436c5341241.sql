-- ============================================================
-- 1. Profiles: a household member is no longer the same thing as a login
-- ============================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS invited_by uuid;

-- Existing rows: the profile id *is* the auth user id.
UPDATE public.profiles SET user_id = id WHERE user_id IS NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_key ON public.profiles(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'pending'));

-- A pending member has no login; an active one must have exactly one.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_user_check
  CHECK ((status = 'pending' AND user_id IS NULL) OR (status = 'active' AND user_id IS NOT NULL));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- One member per email per household, whether they have signed in or not.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_household_email_key
  ON public.profiles(household_id, lower(email));

-- ============================================================
-- 2. The RLS helpers now resolve a login to its member record
-- ============================================================

CREATE OR REPLACE FUNCTION private.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION private.current_household_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT household_id FROM public.profiles WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION private.current_role_is_owner()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'owner')
$$;

-- ============================================================
-- 3. Profile policies
-- ============================================================

DROP POLICY IF EXISTS "update own profile" ON public.profiles;

CREATE POLICY "update own profile"
  ON public.profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND household_id = private.current_household_id());

CREATE POLICY "owner adds pending members"
  ON public.profiles FOR INSERT
  WITH CHECK (
    household_id = private.current_household_id()
    AND private.current_role_is_owner()
    AND status = 'pending'
    AND user_id IS NULL
  );

CREATE POLICY "owner edits pending members"
  ON public.profiles FOR UPDATE
  USING (
    household_id = private.current_household_id()
    AND private.current_role_is_owner()
    AND status = 'pending'
  )
  WITH CHECK (
    household_id = private.current_household_id()
    AND status = 'pending'
    AND user_id IS NULL
  );

CREATE POLICY "owner removes pending members"
  ON public.profiles FOR DELETE
  USING (
    household_id = private.current_household_id()
    AND private.current_role_is_owner()
    AND status = 'pending'
  );

-- ============================================================
-- 4. Per-account visibility
-- ============================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'household';

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_visibility_check CHECK (visibility IN ('household', 'private'));

-- Private with nobody to be private to would be a hole, not a setting.
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_private_needs_owner
  CHECK (visibility = 'household' OR owner_profile_id IS NOT NULL);

CREATE OR REPLACE FUNCTION private.account_hidden(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.accounts a
     WHERE a.id = target
       AND a.visibility = 'private'
       AND a.owner_profile_id IS DISTINCT FROM private.current_profile_id()
  )
$$;

DROP POLICY IF EXISTS "household members full access" ON public.accounts;

CREATE POLICY "household members full access"
  ON public.accounts FOR ALL
  USING (
    household_id = private.current_household_id()
    AND (visibility = 'household' OR owner_profile_id = private.current_profile_id())
  )
  WITH CHECK (
    household_id = private.current_household_id()
    AND (visibility = 'household' OR owner_profile_id = private.current_profile_id())
  );

DROP POLICY IF EXISTS "household members full access" ON public.transactions;

CREATE POLICY "household members full access"
  ON public.transactions FOR ALL
  USING (
    household_id = private.current_household_id()
    AND (account_id IS NULL OR NOT private.account_hidden(account_id))
  )
  WITH CHECK (
    household_id = private.current_household_id()
    AND (account_id IS NULL OR NOT private.account_hidden(account_id))
  );

DROP POLICY IF EXISTS "household members full access" ON public.statements;

CREATE POLICY "household members full access"
  ON public.statements FOR ALL
  USING (
    household_id = private.current_household_id()
    AND (account_id IS NULL OR NOT private.account_hidden(account_id))
  )
  WITH CHECK (
    household_id = private.current_household_id()
    AND (account_id IS NULL OR NOT private.account_hidden(account_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;