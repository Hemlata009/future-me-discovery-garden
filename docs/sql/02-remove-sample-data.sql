-- =====================================================================
-- Removes everything created by 01-accounts-and-sample-data.sql:
-- the sample leads, anonymous visitors, their projects, briefs, events,
-- engagement, the student's saved details, and the two sample logins.
-- Real data is untouched: rows are matched only by the sample visitor IDs
-- and the two sample emails.
-- =====================================================================
DO $$
DECLARE
  ids text[];
BEGIN
  SELECT array_agg(encode(sha256(convert_to('ffseed-' || s, 'UTF8')), 'hex')) INTO ids
  FROM (
    SELECT 'student' AS s UNION ALL SELECT 'parent-student'
    UNION ALL SELECT 'lead-' || g FROM generate_series(1, 36) g
    UNION ALL SELECT 'parent-' || g FROM generate_series(1, 36) g
    UNION ALL SELECT 'anon-' || g FROM generate_series(1, 160) g
    UNION ALL SELECT 'friend-' || a || '-' || b FROM generate_series(1, 6) a, generate_series(1, 4) b
  ) seeds;

  -- student_activity exists only after 03-student-signup-and-activity.sql.
  IF to_regclass('public.student_activity') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.student_activity WHERE visitor_hash = ANY ($1)' USING ids;
  END IF;
  DELETE FROM public.growth_events WHERE visitor_hash = ANY (ids);
  DELETE FROM public.engagement_heartbeats WHERE visitor_hash = ANY (ids);
  DELETE FROM public.engagement_sessions WHERE visitor_hash = ANY (ids);
  DELETE FROM public.counsellor_requests WHERE visitor_hash = ANY (ids);
  DELETE FROM public.parent_question_attempts WHERE visitor_hash = ANY (ids);
  DELETE FROM public.pre_application_profiles WHERE visitor_hash = ANY (ids);
  DELETE FROM public.visitor_attribution WHERE visitor_hash = ANY (ids);
  DELETE FROM public.referral_links WHERE owner_visitor_hash = ANY (ids);
  -- Cascades to the sample parent briefs.
  DELETE FROM public.generated_projects WHERE owner_visitor_hash = ANY (ids);
  -- Cascades to user_roles, identities and student_accounts.
  DELETE FROM auth.users WHERE email IN ('counsellor@futureme.in', 'student@futureme.in');
  RAISE NOTICE 'Sample data and sample logins removed.';
END $$;
