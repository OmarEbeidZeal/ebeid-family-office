ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme_name text NOT NULL DEFAULT 'midnight',
  ADD COLUMN IF NOT EXISTS sign_palette text NOT NULL DEFAULT 'green_red';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_theme_name_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_theme_name_check
  CHECK (theme_name IN ('system', 'midnight', 'parchment', 'slate', 'linen', 'contrast'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_sign_palette_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_sign_palette_check
  CHECK (sign_palette IN ('green_red', 'blue_orange'));

COMMENT ON COLUMN public.profiles.theme_name IS 'Named surface/accent theme chosen in Settings, or ''system'' to follow the device.';
COMMENT ON COLUMN public.profiles.sign_palette IS 'Which pair of colours marks gain and loss. Independent of the theme; never the only cue.';