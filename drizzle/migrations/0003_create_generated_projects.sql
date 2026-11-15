CREATE TABLE public.generated_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  interest TEXT NOT NULL,
  technology TEXT NOT NULL,
  project_type TEXT NOT NULL,
  class_status TEXT NOT NULL,
  language TEXT NOT NULL,
  custom_idea TEXT,
  generated_content JSONB NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER
);

GRANT SELECT ON public.generated_projects TO anon;
GRANT SELECT ON public.generated_projects TO authenticated;
GRANT ALL ON public.generated_projects TO service_role;

ALTER TABLE public.generated_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone with the link can read a generated project"
ON public.generated_projects
FOR SELECT
TO anon, authenticated
USING (true);

CREATE INDEX generated_projects_created_at_idx
ON public.generated_projects (created_at DESC);