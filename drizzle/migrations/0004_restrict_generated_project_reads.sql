-- Student projects are no longer readable straight from the database by
-- visitors or signed-in users. Only the site's own server-side lookup, which
-- fetches exactly one project by its id, can read them.
DROP POLICY IF EXISTS "Anyone with the link can read a generated project" ON public.generated_projects;

REVOKE ALL ON public.generated_projects FROM anon, authenticated;
GRANT ALL ON public.generated_projects TO service_role;

ALTER TABLE public.generated_projects ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.generated_projects IS 'AI-generated student projects. Read only through the site''s server-side lookup by project id; anonymous and signed-in database roles have no access.';