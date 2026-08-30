CREATE OR REPLACE FUNCTION private.job_key_for_path(job_path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN job_path LIKE '%net-worth-snapshot%' THEN 'net_worth_snapshot'
    WHEN job_path LIKE '%fx-refresh%' THEN 'fx_refresh'
    WHEN job_path LIKE '%market-close%' THEN 'market_close'
    WHEN job_path LIKE '%weekly-briefing%' THEN 'weekly_briefing'
    ELSE 'unknown'
  END;
$$;