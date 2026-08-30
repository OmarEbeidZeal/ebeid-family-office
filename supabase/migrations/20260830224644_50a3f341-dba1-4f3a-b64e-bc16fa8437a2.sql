-- The scheduler reaches the app over HTTP, so the shared secret has to travel
-- with each call. It stays inside Postgres: the helper reads it from the
-- private config table at call time, so no job definition, log line or file in
-- the codebase ever contains the value.

INSERT INTO private.job_config (key, value)
VALUES ('app_base_url', 'https://project--69ddcd0d-d8b3-4f08-b4ea-0b75bddbe531.lovable.app')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

CREATE OR REPLACE FUNCTION private.call_job_hook(job_path text, timeout_ms integer DEFAULT 120000)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  base_url text;
  secret text;
  request_id bigint;
BEGIN
  SELECT value INTO base_url FROM private.job_config WHERE key = 'app_base_url';
  SELECT value INTO secret FROM private.job_config WHERE key = 'cron_hook_secret';

  IF base_url IS NULL OR secret IS NULL THEN
    RAISE EXCEPTION 'The scheduler is not configured: app_base_url or cron_hook_secret is missing.';
  END IF;

  SELECT net.http_post(
    url := base_url || job_path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := timeout_ms
  ) INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.call_job_hook(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.call_job_hook(text, integer) FROM anon, authenticated;