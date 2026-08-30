CREATE OR REPLACE FUNCTION private.call_job_hook(job_path text, timeout_ms integer DEFAULT 120000)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  base_url text;
  secret text;
  req_id bigint;
BEGIN
  -- How the previous calls went, before making another one.
  PERFORM private.sweep_job_calls();

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
  ) INTO req_id;

  INSERT INTO private.job_calls (request_id, path) VALUES (req_id, job_path)
  ON CONFLICT (request_id) DO NOTHING;

  RETURN req_id;
END;
$$;

REVOKE ALL ON FUNCTION private.call_job_hook(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.call_job_hook(text, integer) FROM anon, authenticated;