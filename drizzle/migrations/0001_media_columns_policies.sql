ALTER TABLE public.generated_content ADD COLUMN IF NOT EXISTS media_data jsonb, ADD COLUMN IF NOT EXISTS file_path text;
CREATE POLICY "own media read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='generated-media' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "own media insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='generated-media' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "own media update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='generated-media' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "own media delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='generated-media' AND (storage.foldername(name))[1]=auth.uid()::text);