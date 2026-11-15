-- Default privileges gave every role full table rights. RLS already gates rows;
-- this narrows the table-level grants to exactly what the app's policies allow.

REVOKE ALL ON public.projects FROM anon, authenticated;
REVOKE ALL ON public.discovery_responses FROM anon, authenticated;
REVOKE ALL ON public.project_shares FROM anon, authenticated;
REVOKE ALL ON public.referral_invitations FROM anon, authenticated;
REVOKE ALL ON public.referral_visits FROM anon, authenticated;
REVOKE ALL ON public.niat_interests FROM anon, authenticated;
REVOKE ALL ON public.visits FROM anon, authenticated;
REVOKE ALL ON public.saved_projects FROM anon, authenticated;
REVOKE ALL ON public.user_roles FROM anon, authenticated;

-- Public project list: read only.
GRANT SELECT ON public.projects TO anon;

-- Recording activity is open to visitors; reading it back is not.
GRANT INSERT ON public.discovery_responses TO anon;
GRANT INSERT ON public.project_shares TO anon;
GRANT INSERT ON public.referral_invitations TO anon;
GRANT INSERT ON public.referral_visits TO anon;
GRANT INSERT ON public.niat_interests TO anon;
GRANT INSERT ON public.visits TO anon;

-- Signed-in students: read the catalog, record activity, and read back admin-visible
-- aggregates only through the role check (SELECT is granted so the admin policies work).
GRANT SELECT ON public.projects TO authenticated;
GRANT SELECT, INSERT ON public.discovery_responses TO authenticated;
GRANT SELECT, INSERT ON public.project_shares TO authenticated;
GRANT SELECT, INSERT ON public.referral_invitations TO authenticated;
GRANT SELECT, INSERT ON public.referral_visits TO authenticated;
GRANT SELECT, INSERT ON public.niat_interests TO authenticated;
GRANT SELECT, INSERT ON public.visits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_projects TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;