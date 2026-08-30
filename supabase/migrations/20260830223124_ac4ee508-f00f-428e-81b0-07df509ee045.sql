-- The scheduler's shared secret is minted inside the database and never leaves it.
insert into private.job_config (key, value)
select 'cron_hook_secret', encode(extensions.gen_random_bytes(32), 'hex')
on conflict (key) do nothing;

-- Answers "is this the right key?" without ever returning the key itself.
create or replace function public.verify_job_secret(token text)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
      from private.job_config
     where key = 'cron_hook_secret'
       and length(coalesce(token, '')) >= 32
       and value = token
  );
$$;

revoke all on function public.verify_job_secret(text) from public;
revoke all on function public.verify_job_secret(text) from anon;
revoke all on function public.verify_job_secret(text) from authenticated;
grant execute on function public.verify_job_secret(text) to service_role;