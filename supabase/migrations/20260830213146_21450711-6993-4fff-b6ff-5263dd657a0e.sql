-- Goal photographs: pointer on the goal row plus household-scoped access to the private bucket.
alter table public.goals add column if not exists image_path text;

drop policy if exists "household reads own goal images" on storage.objects;
drop policy if exists "household uploads goal images" on storage.objects;
drop policy if exists "household updates goal images" on storage.objects;
drop policy if exists "household deletes goal images" on storage.objects;

create policy "household reads own goal images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'goal-images'
    and (storage.foldername(name))[1] = (private.current_household_id())::text
  );

create policy "household uploads goal images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'goal-images'
    and (storage.foldername(name))[1] = (private.current_household_id())::text
  );

create policy "household updates goal images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'goal-images'
    and (storage.foldername(name))[1] = (private.current_household_id())::text
  )
  with check (
    bucket_id = 'goal-images'
    and (storage.foldername(name))[1] = (private.current_household_id())::text
  );

create policy "household deletes goal images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'goal-images'
    and (storage.foldername(name))[1] = (private.current_household_id())::text
  );