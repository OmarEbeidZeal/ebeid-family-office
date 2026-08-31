ALTER TABLE public.statements ADD COLUMN IF NOT EXISTS format_version text;

COMMENT ON COLUMN public.statements.format_version IS 'The dialect the source file declared, e.g. camt.053.001.08. Recorded for traceability only; the parser never branches on it.';