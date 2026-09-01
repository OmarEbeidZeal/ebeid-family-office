ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_batch_idx ON public.documents (import_batch_id);