CREATE POLICY "household reads own document files" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = private.current_household_id()::text
  );

CREATE POLICY "household uploads document files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = private.current_household_id()::text
  );

CREATE POLICY "household updates document files" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = private.current_household_id()::text
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = private.current_household_id()::text
  );

CREATE POLICY "household deletes document files" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = private.current_household_id()::text
  );