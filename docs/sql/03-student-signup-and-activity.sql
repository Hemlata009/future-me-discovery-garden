-- =====================================================================
-- FutureMe Family: free student sign-up, activity tracking and invites.
-- Run once in the Lovable Cloud SQL editor, AFTER 01-accounts-and-sample-data.sql.
-- Additive and safe to re-run. Then ask Lovable to regenerate the Supabase types.
-- =====================================================================

-- 1. A student sign-up is a consented lead even before they have a project.
ALTER TABLE public.counsellor_requests ALTER COLUMN generated_project_id DROP NOT NULL;
ALTER TABLE public.counsellor_requests
  ADD COLUMN IF NOT EXISTS lead_source text NOT NULL DEFAULT 'callback_request',
  ADD COLUMN IF NOT EXISTS student_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
DO $$ BEGIN
  ALTER TABLE public.counsellor_requests ADD CONSTRAINT counsellor_requests_lead_source_check
    CHECK (lead_source IN ('callback_request', 'student_signup'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS counsellor_requests_one_signup_per_student
  ON public.counsellor_requests (student_user_id) WHERE lead_source = 'student_signup';

-- 2. Basic student details captured at sign-up, plus a personal invite code.
ALTER TABLE public.student_accounts
  ADD COLUMN IF NOT EXISTS full_name text CHECK (full_name IS NULL OR char_length(full_name) BETWEEN 2 AND 80),
  ADD COLUMN IF NOT EXISTS phone text CHECK (phone IS NULL OR phone ~ '^[6-9][0-9]{9}$'),
  ADD COLUMN IF NOT EXISTS class_status text CHECK (class_status IS NULL OR class_status IN ('class12', 'completed', 'other')),
  ADD COLUMN IF NOT EXISTS city text CHECK (city IS NULL OR char_length(city) <= 60),
  ADD COLUMN IF NOT EXISTS consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_code text UNIQUE CHECK (invite_code IS NULL OR invite_code ~ '^[A-Za-z0-9]{8,16}$'),
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Behaviour log: page views (with time on page), logins, logouts, return visits, invites.
CREATE TABLE IF NOT EXISTS public.student_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  visitor_hash text CHECK (visitor_hash IS NULL OR visitor_hash ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK (kind IN (
    'page_view', 'signup', 'login', 'logout', 'return_visit', 'signup_prompt_shown',
    'invite_created', 'invite_visit', 'invite_signup'
  )),
  path text CHECK (path IS NULL OR char_length(path) <= 200),
  seconds integer CHECK (seconds IS NULL OR seconds BETWEEN 0 AND 3600),
  detail text CHECK (detail IS NULL OR char_length(detail) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR visitor_hash IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS student_activity_user_idx ON public.student_activity (user_id, created_at);
CREATE INDEX IF NOT EXISTS student_activity_visitor_idx ON public.student_activity (visitor_hash, created_at);
REVOKE ALL ON public.student_activity FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.student_activity TO service_role;
ALTER TABLE public.student_activity ENABLE ROW LEVEL SECURITY;

-- 4. Sample behaviour for the sample leads and the sample student (skipped if absent/already done).
DO $$
DECLARE
  i int; k int; h text; t0 timestamptz; uid uuid; pages text[] := ARRAY[
    '/', '/discover', '/projects', '/how-it-works', '/showcase', '/project', '/parent'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.counsellor_requests
                 WHERE visitor_hash = encode(sha256(convert_to('ffseed-lead-1', 'UTF8')), 'hex')) THEN
    RAISE NOTICE 'Sample leads not found; skipping sample behaviour.';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.student_activity
             WHERE visitor_hash = encode(sha256(convert_to('ffseed-lead-1', 'UTF8')), 'hex')) THEN
    RAISE NOTICE 'Sample behaviour already present.';
    RETURN;
  END IF;

  FOR i IN 1..36 LOOP
    h := encode(sha256(convert_to('ffseed-lead-' || i, 'UTF8')), 'hex');
    SELECT created_at - interval '40 minutes' INTO t0 FROM public.counsellor_requests WHERE visitor_hash = h;
    -- Pages explored before asking for a counsellor, with time on each page.
    FOR k IN 1..(3 + i % 6) LOOP
      INSERT INTO public.student_activity (visitor_hash, kind, path, seconds, created_at)
      VALUES (h, 'page_view', pages[1 + (i + k) % array_length(pages, 1)], 20 + ((i * 37 + k * 53) % 260),
              t0 + k * interval '3 minutes');
    END LOOP;
    IF i % 4 <> 3 THEN
      INSERT INTO public.student_activity (visitor_hash, kind, created_at)
      VALUES (h, 'signup_prompt_shown', t0 + interval '6 minutes');
    END IF;
    -- Return visits over the following days.
    FOR k IN 1..(i % 5) LOOP
      INSERT INTO public.student_activity (visitor_hash, kind, created_at)
      VALUES (h, 'return_visit', t0 + k * interval '1 day 2 hours');
      INSERT INTO public.student_activity (visitor_hash, kind, path, seconds, created_at)
      VALUES (h, 'page_view', pages[1 + (i * k) % array_length(pages, 1)], 45 + ((i * 11 + k * 29) % 200),
              t0 + k * interval '1 day 2 hours' + interval '1 minute');
    END LOOP;
    -- Some students invited parents and friends.
    IF i % 3 = 0 THEN
      INSERT INTO public.student_activity (visitor_hash, kind, detail, created_at)
      VALUES (h, 'invite_created', 'parent', t0 + interval '1 hour'),
             (h, 'invite_visit', 'parent', t0 + interval '5 hours');
    END IF;
    IF i % 4 = 1 THEN
      INSERT INTO public.student_activity (visitor_hash, kind, detail, created_at)
      VALUES (h, 'invite_created', 'friend', t0 + interval '2 hours'),
             (h, 'invite_visit', 'friend', t0 + interval '9 hours');
      IF i % 8 = 1 THEN
        INSERT INTO public.student_activity (visitor_hash, kind, detail, created_at)
        VALUES (h, 'invite_signup', 'friend', t0 + interval '1 day');
      END IF;
    END IF;
  END LOOP;

  -- The sample student account: signed up, several logins/logouts, invites.
  SELECT id INTO uid FROM auth.users WHERE email = 'student@futureme.in';
  IF uid IS NOT NULL THEN
    h := encode(sha256(convert_to('ffseed-student', 'UTF8')), 'hex');
    UPDATE public.student_accounts
      SET full_name = 'Riya Sharma', phone = '9812345670', class_status = 'class12', city = 'Hyderabad',
          consent_at = now() - interval '3 days 3 hours',
          invite_code = COALESCE(invite_code, 'RIYA' || upper(substr(h, 1, 6)))
      WHERE user_id = uid;
    UPDATE public.counsellor_requests
      SET lead_source = 'student_signup', student_user_id = uid
      WHERE visitor_hash = h AND student_user_id IS NULL;
    t0 := now() - interval '3 days 4 hours';
    FOR k IN 1..6 LOOP
      INSERT INTO public.student_activity (user_id, visitor_hash, kind, path, seconds, created_at)
      VALUES (uid, h, 'page_view', pages[1 + k % array_length(pages, 1)], 60 + k * 41, t0 - interval '30 minutes' + k * interval '4 minutes');
    END LOOP;
    INSERT INTO public.student_activity (user_id, visitor_hash, kind, created_at) VALUES
      (uid, h, 'signup_prompt_shown', t0 - interval '8 minutes'),
      (uid, h, 'signup', t0 - interval '5 minutes'),
      (uid, h, 'login', t0 - interval '5 minutes'),
      (uid, h, 'logout', t0 + interval '50 minutes'),
      (uid, h, 'login', t0 + interval '1 day'),
      (uid, h, 'return_visit', t0 + interval '1 day'),
      (uid, h, 'logout', t0 + interval '1 day 40 minutes'),
      (uid, h, 'login', t0 + interval '2 days 3 hours'),
      (uid, h, 'return_visit', t0 + interval '2 days 3 hours');
    INSERT INTO public.student_activity (user_id, visitor_hash, kind, detail, created_at) VALUES
      (uid, h, 'invite_created', 'parent', t0 + interval '1 hour'),
      (uid, h, 'invite_visit', 'parent', t0 + interval '6 hours'),
      (uid, h, 'invite_created', 'friend', t0 + interval '1 day 10 minutes'),
      (uid, h, 'invite_visit', 'friend', t0 + interval '1 day 4 hours');
  END IF;
  RAISE NOTICE 'Sample behaviour added.';
END $$;

SELECT kind, count(*) FROM public.student_activity GROUP BY 1 ORDER BY 1;
