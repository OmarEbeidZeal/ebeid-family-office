-- A job that fires but never reaches the app writes nothing anywhere, so the
-- app would keep saying "not run yet" indefinitely. Each call now leaves a
-- private note, and the next call checks how the previous ones went.

CREATE TABLE IF NOT EXISTS private.job_calls (
  request_id bigint PRIMARY KEY,
  path text NOT NULL,
  called_at timestamptz NOT NULL DEFAULT now(),
  checked boolean NOT NULL DEFAULT false
);

REVOKE ALL ON TABLE private.job_calls FROM PUBLIC;
REVOKE ALL ON TABLE private.job_calls FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.job_key_for_path(job_path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN job_path LIKE '%net-worth-snapshot%' THEN 'net_worth_snapshot'
    WHEN job_path LIKE '%fx-refresh%' THEN 'fx_refresh'
    WHEN job_path LIKE '%market-close%' THEN 'market_close'
    WHEN job_path LIKE '%weekly-briefing%' THEN 'weekly_briefing'
    ELSE 'unknown'
  END;
$$;

CREATE OR REPLACE FUNCTION private.sweep_job_calls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, net
AS $$
DECLARE
  call record;
  response record;
BEGIN
  FOR call IN
    SELECT * FROM private.job_calls
     WHERE NOT checked AND called_at < now() - interval '3 minutes'
     ORDER BY called_at
     LIMIT 50
  LOOP
    SELECT status_code, error_msg INTO response
      FROM net._http_response WHERE id = call.request_id;

    IF FOUND THEN
      IF response.status_code IS NULL OR response.status_code >= 300 OR response.error_msg IS NOT NULL THEN
        INSERT INTO public.automation_runs (job, status, message, households, detail)
        VALUES (
          private.job_key_for_path(call.path),
          'failed',
          CASE
            WHEN response.status_code = 404 THEN
              'The scheduled call did not reach the app: the endpoint was not found. Publish the app so this job has something to call.'
            WHEN response.status_code = 401 THEN
              'The scheduled call was refused: the app did not accept the scheduler''s credential.'
            ELSE
              'The scheduled call did not get through.'
          END,
          0,
          jsonb_build_object(
            'http_status', response.status_code,
            'error', response.error_msg,
            'path', call.path
          )
        );
      END IF;
      UPDATE private.job_calls SET checked = true WHERE request_id = call.request_id;
    ELSIF call.called_at < now() - interval '2 hours' THEN
      -- pg_net expires responses; past that window the outcome is unknowable
      -- and guessing at one would be worse than silence.
      UPDATE private.job_calls SET checked = true WHERE request_id = call.request_id;
    END IF;
  END LOOP;

  DELETE FROM private.job_calls WHERE called_at < now() - interval '7 days';
END;
$$;

REVOKE ALL ON FUNCTION private.sweep_job_calls() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sweep_job_calls() FROM anon, authenticated;

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
  ) INTO request_id;

  INSERT INTO private.job_calls (request_id, path) VALUES (request_id, job_path)
  ON CONFLICT (request_id) DO NOTHING;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.call_job_hook(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.call_job_hook(text, integer) FROM anon, authenticated;