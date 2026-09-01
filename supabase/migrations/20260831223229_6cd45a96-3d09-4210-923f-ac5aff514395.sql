CREATE OR REPLACE FUNCTION private.job_key_for_path(job_path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN job_path LIKE '%net-worth-snapshot%' THEN 'net_worth_snapshot'
    WHEN job_path LIKE '%fx-refresh%' THEN 'fx_refresh'
    WHEN job_path LIKE '%market-close%' THEN 'market_close'
    WHEN job_path LIKE '%weekly-briefing%' THEN 'weekly_briefing'
    WHEN job_path LIKE '%document-queue%' THEN 'document_queue'
    WHEN job_path LIKE '%import-queue%' THEN 'import_queue'
    ELSE 'unknown'
  END;
$function$;

DO $$
BEGIN
  PERFORM cron.unschedule('document-queue-sweep');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'document-queue-sweep',
  '*/5 * * * *',
  $$SELECT private.call_job_hook('/api/public/hooks/document-queue', 120000)$$
);