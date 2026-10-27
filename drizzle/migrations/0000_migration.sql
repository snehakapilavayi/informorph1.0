CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL DEFAULT 'Untitled project',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own projects" ON public.projects FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.source_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  version_number int NOT NULL DEFAULT 1,
  source_type text NOT NULL DEFAULT 'text',
  extracted_text text NOT NULL,
  extracted_facts jsonb,
  file_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_versions TO authenticated;
GRANT ALL ON public.source_versions TO service_role;
ALTER TABLE public.source_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own versions" ON public.source_versions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.generated_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_version_id uuid REFERENCES public.source_versions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  platform text NOT NULL,
  audience text, tone text, language text, objective text, hook text,
  headline text,
  generated_text text NOT NULL,
  verification_result jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_content TO authenticated;
GRANT ALL ON public.generated_content TO service_role;
ALTER TABLE public.generated_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own content" ON public.generated_content FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.revision_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  old_version_id uuid REFERENCES public.source_versions(id) ON DELETE SET NULL,
  new_version_id uuid REFERENCES public.source_versions(id) ON DELETE SET NULL,
  detected_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_platforms text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revision_changes TO authenticated;
GRANT ALL ON public.revision_changes TO service_role;
ALTER TABLE public.revision_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own revisions" ON public.revision_changes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own docs read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'source-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own docs insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'source-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own docs delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'source-documents' AND (storage.foldername(name))[1] = auth.uid()::text);