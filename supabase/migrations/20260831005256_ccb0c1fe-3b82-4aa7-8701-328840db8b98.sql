-- The advisor briefing is weekly, not daily: Sundays at 07:00 UTC.
-- Recorded here so a reset or replay cannot reintroduce the daily schedule.
SELECT cron.unschedule('weekly-advisor-briefing')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-advisor-briefing');

SELECT cron.schedule(
  'weekly-advisor-briefing',
  '0 7 * * 0',
  $$SELECT private.call_job_hook('/api/public/hooks/weekly-briefing', 300000)$$
);