-- =====================================================================
-- FutureMe Family: student/counsellor logins + realistic sample data
-- Run once in the Lovable Cloud SQL editor (Database → SQL editor).
-- Safe to re-run: existing logins are reused and sample rows are only
-- inserted if they don't exist yet.
-- Remove everything again with docs/sql/02-remove-sample-data.sql.
--
-- BEFORE RUNNING: change the two passwords below if you want different ones.
-- The phone numbers are sample numbers: do not call them.
-- =====================================================================

-- ---------- 1. Link a student login to their FutureMe activity ----------
CREATE TABLE IF NOT EXISTS public.student_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  visitor_hash text UNIQUE CHECK (visitor_hash IS NULL OR visitor_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.student_accounts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.student_accounts TO service_role;
ALTER TABLE public.student_accounts ENABLE ROW LEVEL SECURITY;

-- ---------- 2. Helper used only while this script runs ----------
CREATE OR REPLACE FUNCTION pg_temp.ev(
  _name text, _vh text, _at timestamptz, _pid uuid DEFAULT NULL, _bid uuid DEFAULT NULL,
  _cta text DEFAULT NULL, _channel text DEFAULT NULL,
  _src text DEFAULT NULL, _med text DEFAULT NULL, _camp text DEFAULT NULL, _ref text DEFAULT NULL,
  _int text DEFAULT NULL, _tech text DEFAULT NULL, _lang text DEFAULT NULL, _cls text DEFAULT NULL,
  _fail text DEFAULT NULL
) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO public.growth_events (
    event_name, visitor_hash, generated_project_id, parent_brief_id, cta, channel,
    utm_source, utm_medium, utm_campaign, referral_code,
    interest, technology, language, class_status, dedupe_key, event_date, created_at, entry_page, failure_kind
  ) VALUES (
    _name, _vh, _pid, _bid, _cta, _channel, _src, _med, _camp, _ref,
    _int, _tech, _lang, _cls,
    _name || ':' || _vh || ':' || gen_random_uuid()::text,
    (_at AT TIME ZONE 'utc')::date, _at,
    CASE WHEN _name = 'landing_visit' THEN 'home' END, _fail
  );
$f$;

CREATE OR REPLACE FUNCTION pg_temp.make_user(_email text, _password text, _role public.app_role)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = _email;
  IF uid IS NULL THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', _email,
      extensions.crypt(_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', _email, 'email_verified', true),
      'email', now(), now(), now());
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, _role) ON CONFLICT (user_id, role) DO NOTHING;
  RETURN uid;
END $f$;

CREATE OR REPLACE FUNCTION pg_temp.vh(_seed text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT encode(sha256(convert_to('ffseed-' || _seed, 'UTF8')), 'hex');
$f$;

CREATE OR REPLACE FUNCTION pg_temp.project_content(_title text, _interest text, _tech text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $f$
  SELECT jsonb_build_object(
    'title', _title,
    'tagline', 'A beginner ' || upper(_tech) || ' project built around ' || _interest || '.',
    'interest_connection', 'This project starts from your interest in ' || _interest || ' and turns it into something you can build and show.',
    'problem', 'People around you face everyday problems in ' || _interest || ' that a small, well-designed tool can make easier.',
    'description', 'You will design and build a simple ' || upper(_tech) || ' tool step by step. It starts small, works on a laptop or phone, and grows as you learn new skills over the first year.',
    'difficulty', 'Beginner',
    'technologies', jsonb_build_array(upper(_tech), 'Python', 'Spreadsheets'),
    'roadmap', jsonb_build_array('Sketch the idea and who it helps', 'Build a first working version', 'Test it with two friends and improve it', 'Share a short demo video'),
    'first_milestone', 'Get a first version working that answers one real question for one user.',
    'future_extensions', jsonb_build_array('Add support for Hindi and Telugu', 'Turn it into a small web app others can use'),
    'career_connection', 'Builds the habits used by product engineers and data teams.',
    'motivation', 'Every expert started with a small project like this. Yours is a great first step.'
  );
$f$;

CREATE OR REPLACE FUNCTION pg_temp.brief_content(_title text, _interest text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $f$
  SELECT jsonb_build_object(
    'headline', 'Your child explored ' || _title,
    'what_your_child_explored', 'Your child answered five questions about their interests and chose ' || _interest || ' as a starting point.',
    'project_summary', 'They received a beginner project idea, ' || _title || ', with a simple step-by-step plan to build it.',
    'why_this_fits', 'The project connects something they already care about with practical technology skills.',
    'what_niat_is_and_is_not', jsonb_build_array(
      'NIAT is an upskilling initiative by NxtWave, not a university.',
      'The B.Tech degree is awarded by the partner university.',
      'First-year topics include AI essentials, Python and programming foundations.',
      'Fees and eligibility are explained by a NIAT counsellor.'
    ),
    'questions_to_ask_a_counsellor', jsonb_build_array(
      'How does the partner university admission work?',
      'What will my child learn in the first year?',
      'What are the fees and payment options?'
    )
  );
$f$;

-- ---------- 3. Logins, leads and activity ----------
DO $$
DECLARE
  -- Logins (change the passwords if you like)
  c_email text := 'counsellor@futureme.in';
  c_pass  text := 'Counsellor@2026';
  s_email text := 'student@futureme.in';
  s_pass  text := 'Student@2026';

  counsellor uuid;
  student uuid;
  admin_id uuid;

  students text[] := ARRAY['Aarav Reddy','Ananya Sharma','Rohit Kumar','Sneha Patel','Karthik Rao','Meera Iyer',
    'Vikram Singh','Divya Nair','Arjun Verma','Pooja Gupta','Rahul Das','Lakshmi Prasad','Imran Khan','Kavya Menon',
    'Siddharth Joshi','Neha Agarwal','Aditya Mishra','Shreya Pillai','Manish Yadav','Priya Krishnan','Harsha Vardhan',
    'Sana Begum','Nikhil Chauhan','Tanvi Kulkarni','Varun Bhat','Ishita Sen','Gautam Naidu','Ritika Malhotra',
    'Abhishek Pandey','Swathi Reddy','Yash Thakur','Nandini Rao','Kiran Kumar','Farhan Ali','Bhavya Shetty','Om Prakash'];
  parents text[] := ARRAY['Suresh Reddy','Kavita Sharma','Ramesh Kumar','Nisha Patel','Venkat Rao','Lalitha Iyer',
    'Rajinder Singh','Sunitha Nair','Anil Verma','Rekha Gupta','Subhash Das','Padma Prasad','Salim Khan','Geetha Menon',
    'Prakash Joshi','Sarita Agarwal','Ashok Mishra','Latha Pillai','Mahesh Yadav','Usha Krishnan','Srinivas Vardhan',
    'Rukhsana Begum','Dinesh Chauhan','Shobha Kulkarni','Raghav Bhat','Mitali Sen','Ravi Naidu','Anjali Malhotra',
    'Sanjay Pandey','Vijaya Reddy','Mohan Thakur','Shanti Rao','Gopal Kumar','Nasreen Ali','Sudha Shetty','Hari Prakash'];
  interests text[] := ARRAY['farming','robotics','gaming','science','farming','robotics','community','creativity'];
  techs text[] := ARRAY['ai','web','iot','ai','web'];
  langs text[] := ARRAY['english','english','hindi','english','telugu','english'];
  classes text[] := ARRAY['class12','class12','completed','class12','other'];
  ptypes text[] := ARRAY['assistant','experience','solution'];
  titles jsonb := '{"farming":"CropCare Assistant","robotics":"Smart Line-Following Robot","gaming":"Game Mood Recommender","science":"Weather Station Explorer","community":"Neighbourhood Help Board","creativity":"AI Story Studio"}';
  statuses text[] := ARRAY['new','assigned','contacted','follow_up','qualified','follow_up','contacted','assigned','not_interested','closed','qualified','follow_up'];
  outcomes text[] := ARRAY['reached','no_answer','busy','callback_requested','reached','reached'];
  notes text[] := ARRAY['Parent wants to understand the partner university process.','Asked to call back after 6 pm.',
    'Student keen on AI track; parent has fee questions.','Shared Parent Brief with family; follow up on Sunday.',
    'Wants details on first-year subjects.','Comparing with a local engineering college.', ''];

  n_leads int := array_length(students, 1);
  i int; k int; h text; ref_owner text; pid uuid; bid uuid; t0 timestamptz;
  src text; med text; camp text; ref text; intr text; tech text; lang text; cls text; title text;
  st text; who text; nm text; sess uuid; beats int; code text;
  student_vh text := pg_temp.vh('student');
BEGIN
  IF EXISTS (SELECT 1 FROM public.growth_events WHERE visitor_hash = pg_temp.vh('lead-1')) THEN
    RAISE NOTICE 'Sample data already present; only logins were checked.';
  END IF;

  counsellor := pg_temp.make_user(c_email, c_pass, 'counsellor');
  student    := pg_temp.make_user(s_email, s_pass, 'student');
  SELECT ur.user_id INTO admin_id FROM public.user_roles ur WHERE ur.role = 'admin' ORDER BY ur.created_at LIMIT 1;

  IF EXISTS (SELECT 1 FROM public.growth_events WHERE visitor_hash = pg_temp.vh('lead-1')) THEN
    RETURN;
  END IF;

  -- Projects first, so referral links can point at them.
  FOR i IN 1..n_leads LOOP
    h := pg_temp.vh('lead-' || i);
    intr := interests[1 + (i % array_length(interests, 1))];
    tech := techs[1 + (i % array_length(techs, 1))];
    title := titles ->> intr;
    INSERT INTO public.generated_projects (id, created_at, interest, technology, project_type, class_status, language, generated_content, model, owner_visitor_hash)
    VALUES (gen_random_uuid(), now() - ((n_leads - i) * interval '17 hours') - interval '2 days',
      intr, tech, ptypes[1 + (i % 3)], classes[1 + (i % array_length(classes, 1))],
      langs[1 + (i % array_length(langs, 1))], pg_temp.project_content(title, intr, tech), 'claude-sonnet-5-5', h);
  END LOOP;

  -- Six leads share referral links.
  FOR i IN 1..6 LOOP
    h := pg_temp.vh('lead-' || i);
    INSERT INTO public.referral_links (code, generated_project_id, owner_visitor_hash, created_at)
    SELECT 'R' || upper(substr(h, 1, 11)), gp.id, h, gp.created_at + interval '20 minutes'
    FROM public.generated_projects gp WHERE gp.owner_visitor_hash = h;
  END LOOP;

  FOR i IN 1..n_leads LOOP
    h := pg_temp.vh('lead-' || i);
    SELECT gp.id, gp.interest, gp.technology, gp.language, gp.class_status, gp.created_at
      INTO pid, intr, tech, lang, cls, t0 FROM public.generated_projects gp WHERE gp.owner_visitor_hash = h;
    title := titles ->> intr;
    -- First-touch source mix: warm-lead campaign, social, search, referral, direct.
    src := NULL; med := NULL; camp := NULL; ref := NULL;
    CASE i % 6
      WHEN 0, 1 THEN src := 'email'; med := 'crm'; camp := 'futureme_family_warmlead_test';
      WHEN 2 THEN src := 'instagram'; med := 'social'; camp := 'class12_explorers';
      WHEN 3 THEN src := 'google'; med := 'cpc'; camp := 'btech_ai_search';
      WHEN 4 THEN IF i > 6 THEN ref := 'R' || upper(substr(pg_temp.vh('lead-' || (1 + i % 6)), 1, 11)); END IF;
      ELSE NULL;
    END CASE;
    INSERT INTO public.visitor_attribution (visitor_hash, utm_source, utm_medium, utm_campaign, referral_code, entry_page, first_seen_at)
    VALUES (h, src, med, camp, ref, 'home', t0 - interval '25 minutes') ON CONFLICT (visitor_hash) DO NOTHING;

    IF ref IS NOT NULL THEN
      PERFORM pg_temp.ev('referral_visit', h, t0 - interval '24 minutes',
        (SELECT rl.generated_project_id FROM public.referral_links rl WHERE rl.code = ref), NULL, NULL, NULL, src, med, camp, ref);
    END IF;
    PERFORM pg_temp.ev('landing_visit', h, t0 - interval '24 minutes', NULL, NULL, NULL, NULL, src, med, camp, ref);
    PERFORM pg_temp.ev('discovery_started', h, t0 - interval '20 minutes', NULL, NULL, NULL, NULL, src, med, camp, ref);
    PERFORM pg_temp.ev('discovery_completed', h, t0 - interval '3 minutes', NULL, NULL, NULL, NULL, src, med, camp, ref, intr, tech, lang, cls);
    PERFORM pg_temp.ev('generation_succeeded', h, t0, pid, NULL, NULL, NULL, src, med, camp, ref, intr, tech, lang, cls);
    PERFORM pg_temp.ev('project_viewed', h, t0 + interval '1 minute', pid, NULL, NULL, NULL, src, med, camp, ref);
    IF i % 4 <> 3 THEN
      PERFORM pg_temp.ev('demo_interacted', h, t0 + interval '4 minutes', pid, NULL, NULL, NULL, src, med, camp, ref);
    END IF;
    IF i % 3 = 0 OR i <= 6 THEN
      PERFORM pg_temp.ev('project_shared', h, t0 + interval '9 minutes', pid, NULL, NULL, CASE WHEN i % 2 = 0 THEN 'whatsapp' ELSE 'copy' END, src, med, camp, ref);
    END IF;

    bid := NULL;
    IF i % 5 <> 2 THEN
      INSERT INTO public.parent_briefs (generated_project_id, language, content, created_at)
      VALUES (pid, lang, pg_temp.brief_content(title, intr), t0 + interval '12 minutes') RETURNING id INTO bid;
      PERFORM pg_temp.ev('parent_brief_generated', h, t0 + interval '12 minutes', pid, bid, NULL, NULL, src, med, camp, ref);
      IF i % 3 <> 1 THEN
        PERFORM pg_temp.ev('parent_brief_shared', h, t0 + interval '14 minutes', pid, bid, NULL, 'whatsapp', src, med, camp, ref);
      END IF;
      IF i % 4 <> 0 THEN
        PERFORM pg_temp.ev('parent_brief_opened', pg_temp.vh('parent-' || i), t0 + interval '3 hours', pid, bid);
      END IF;
      IF i % 3 = 2 THEN
        INSERT INTO public.parent_question_attempts (parent_brief_id, visitor_hash, created_at)
        VALUES (bid, pg_temp.vh('parent-' || i), t0 + interval '3 hours 5 minutes');
        PERFORM pg_temp.ev('parent_question_asked', pg_temp.vh('parent-' || i), t0 + interval '3 hours 5 minutes', pid, bid);
      END IF;
    END IF;

    -- Referral visits brought in by the six link owners.
    IF i <= 6 THEN
      FOR k IN 1..(2 + i % 3) LOOP
        PERFORM pg_temp.ev('referral_visit', pg_temp.vh('friend-' || i || '-' || k), t0 + k * interval '7 hours', pid,
          NULL, NULL, NULL, NULL, NULL, NULL, 'R' || upper(substr(h, 1, 11)));
        PERFORM pg_temp.ev('landing_visit', pg_temp.vh('friend-' || i || '-' || k), t0 + k * interval '7 hours' + interval '1 minute',
          NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'R' || upper(substr(h, 1, 11)));
        INSERT INTO public.visitor_attribution (visitor_hash, referral_code, entry_page, first_seen_at)
        VALUES (pg_temp.vh('friend-' || i || '-' || k), 'R' || upper(substr(h, 1, 11)), 'project', t0 + k * interval '7 hours')
        ON CONFLICT (visitor_hash) DO NOTHING;
      END LOOP;
    END IF;

    IF i % 2 = 0 THEN
      PERFORM pg_temp.ev('cta_clicked', h, t0 + interval '20 minutes', pid, NULL, 'explore_niat', NULL, src, med, camp, ref);
    END IF;
    IF i % 3 = 0 THEN
      PERFORM pg_temp.ev('cta_clicked', h, t0 + interval '22 minutes', pid, NULL, 'visit_niat', NULL, src, med, camp, ref);
    END IF;
    IF i % 4 = 1 THEN
      PERFORM pg_temp.ev('cta_clicked', h, t0 + interval '1 day', pid, NULL, 'start_application', NULL, src, med, camp, ref);
    END IF;

    -- Consented counsellor request: the identified lead.
    who := CASE WHEN i % 3 = 0 THEN 'student' ELSE 'parent' END;
    nm := CASE WHEN who = 'student' THEN students[i] ELSE parents[i] END;
    st := statuses[1 + (i % array_length(statuses, 1))];
    PERFORM pg_temp.ev('counsellor_requested', h, t0 + interval '30 minutes', pid, bid, NULL, NULL, src, med, camp, ref);
    INSERT INTO public.counsellor_requests (
      parent_brief_id, generated_project_id, contact_name, phone, who, language, consent,
      referral_code, utm_source, utm_medium, utm_campaign, created_at, delivered, delivered_at,
      visitor_hash, status, assigned_to, next_follow_up_at, last_contacted_at, call_outcome, internal_notes, updated_at
    ) VALUES (
      bid, pid, nm, (ARRAY['9','8','7','6'])[1 + i % 4] || lpad(((i::bigint * 73856093) % 1000000000)::text, 9, '0'),
      who, lang, true, ref, src, med, camp, t0 + interval '30 minutes',
      i % 11 <> 5, CASE WHEN i % 11 <> 5 THEN t0 + interval '31 minutes' END,
      h, st,
      CASE WHEN st = 'new' THEN NULL WHEN i % 7 = 0 AND admin_id IS NOT NULL THEN admin_id ELSE counsellor END,
      CASE WHEN st IN ('assigned','contacted','follow_up','qualified') THEN
        now() + (ARRAY[interval '-1 day', interval '3 hours', interval '1 day 2 hours', interval '4 days', interval '-5 hours'])[1 + i % 5]
      END,
      CASE WHEN st NOT IN ('new','assigned') THEN t0 + interval '1 day 3 hours' END,
      CASE WHEN st NOT IN ('new','assigned') THEN
        CASE WHEN st = 'not_interested' THEN 'not_interested' ELSE outcomes[1 + i % array_length(outcomes, 1)] END
      END,
      CASE WHEN st IN ('new','assigned') THEN '' ELSE notes[1 + i % array_length(notes, 1)] END,
      t0 + interval '1 day 3 hours'
    );

    -- Server-timed active engagement on the day of the visit and a return visit.
    FOR k IN 0..1 LOOP
      sess := gen_random_uuid();
      beats := 5 + ((i * 7 + k * 11) % 26);
      INSERT INTO public.engagement_sessions (id, visitor_hash, generated_project_id, started_at, last_heartbeat_at, active_seconds, heartbeat_count)
      VALUES (sess, h, pid, t0 + k * interval '2 days', t0 + k * interval '2 days' + beats * interval '30 seconds', beats * 30, beats);
      INSERT INTO public.engagement_heartbeats (session_id, visitor_hash, generated_project_id, active_seconds, created_at)
      SELECT sess, h, pid, 30, t0 + k * interval '2 days' + g * interval '30 seconds' FROM generate_series(1, beats) g;
    END LOOP;
  END LOOP;

  -- Anonymous visitors who explored without asking for a counsellor (aggregate analytics only).
  FOR i IN 1..160 LOOP
    h := pg_temp.vh('anon-' || i);
    t0 := now() - ((i * 4.3) || ' hours')::interval - interval '30 minutes';
    src := NULL; med := NULL; camp := NULL;
    CASE i % 5
      WHEN 0 THEN src := 'email'; med := 'crm'; camp := 'futureme_family_warmlead_test';
      WHEN 1 THEN src := 'instagram'; med := 'social'; camp := 'class12_explorers';
      WHEN 2 THEN src := 'google'; med := 'cpc'; camp := 'btech_ai_search';
      ELSE NULL;
    END CASE;
    intr := interests[1 + (i % array_length(interests, 1))];
    tech := techs[1 + (i % array_length(techs, 1))];
    lang := langs[1 + (i % array_length(langs, 1))];
    cls := classes[1 + (i % array_length(classes, 1))];
    INSERT INTO public.visitor_attribution (visitor_hash, utm_source, utm_medium, utm_campaign, entry_page, first_seen_at)
    VALUES (h, src, med, camp, 'home', t0) ON CONFLICT (visitor_hash) DO NOTHING;
    PERFORM pg_temp.ev('landing_visit', h, t0, NULL, NULL, NULL, NULL, src, med, camp);
    IF i % 10 < 6 THEN
      PERFORM pg_temp.ev('discovery_started', h, t0 + interval '2 minutes', NULL, NULL, NULL, NULL, src, med, camp);
    END IF;
    IF i % 10 < 4 THEN
      PERFORM pg_temp.ev('discovery_completed', h, t0 + interval '12 minutes', NULL, NULL, NULL, NULL, src, med, camp, NULL, intr, tech, lang, cls);
      INSERT INTO public.generated_projects (created_at, interest, technology, project_type, class_status, language, generated_content, model, owner_visitor_hash)
      VALUES (t0 + interval '13 minutes', intr, tech, ptypes[1 + i % 3], cls, lang,
        pg_temp.project_content(titles ->> intr, intr, tech), 'claude-sonnet-5-5', h) RETURNING id INTO pid;
      PERFORM pg_temp.ev('generation_succeeded', h, t0 + interval '13 minutes', pid, NULL, NULL, NULL, src, med, camp, NULL, intr, tech, lang, cls);
      PERFORM pg_temp.ev('project_viewed', h, t0 + interval '14 minutes', pid, NULL, NULL, NULL, src, med, camp);
      IF i % 3 = 0 THEN
        PERFORM pg_temp.ev('demo_interacted', h, t0 + interval '16 minutes', pid, NULL, NULL, NULL, src, med, camp);
      END IF;
      IF i % 4 = 0 THEN
        PERFORM pg_temp.ev('project_shared', h, t0 + interval '18 minutes', pid, NULL, NULL, 'whatsapp', src, med, camp);
      END IF;
      IF i % 6 = 0 THEN
        PERFORM pg_temp.ev('cta_clicked', h, t0 + interval '20 minutes', pid, NULL, 'visit_niat', NULL, src, med, camp);
      END IF;
    END IF;
    IF i % 25 = 7 THEN
      PERFORM pg_temp.ev('generation_failed', h, t0 + interval '13 minutes', NULL, NULL, NULL, NULL, src, med, camp, NULL, NULL, NULL, NULL, NULL, 'anthropic:overloaded');
    END IF;
  END LOOP;

  -- The student login's own journey.
  t0 := now() - interval '3 days 4 hours';
  INSERT INTO public.visitor_attribution (visitor_hash, utm_source, utm_medium, utm_campaign, entry_page, first_seen_at)
  VALUES (student_vh, 'email', 'crm', 'futureme_family_warmlead_test', 'home', t0 - interval '20 minutes') ON CONFLICT (visitor_hash) DO NOTHING;
  INSERT INTO public.generated_projects (created_at, interest, technology, project_type, class_status, language, generated_content, model, owner_visitor_hash)
  VALUES (t0, 'robotics', 'ai', 'assistant', 'class12', 'english',
    pg_temp.project_content('Smart Line-Following Robot', 'robotics', 'ai'), 'claude-sonnet-5-5', student_vh) RETURNING id INTO pid;
  PERFORM pg_temp.ev('landing_visit', student_vh, t0 - interval '20 minutes', NULL, NULL, NULL, NULL, 'email', 'crm', 'futureme_family_warmlead_test');
  PERFORM pg_temp.ev('discovery_started', student_vh, t0 - interval '15 minutes', NULL, NULL, NULL, NULL, 'email', 'crm', 'futureme_family_warmlead_test');
  PERFORM pg_temp.ev('discovery_completed', student_vh, t0 - interval '2 minutes', NULL, NULL, NULL, NULL, 'email', 'crm', 'futureme_family_warmlead_test', NULL, 'robotics', 'ai', 'english', 'class12');
  PERFORM pg_temp.ev('generation_succeeded', student_vh, t0, pid, NULL, NULL, NULL, 'email', 'crm', 'futureme_family_warmlead_test', NULL, 'robotics', 'ai', 'english', 'class12');
  PERFORM pg_temp.ev('project_viewed', student_vh, t0 + interval '1 minute', pid, NULL, NULL, NULL, 'email', 'crm', 'futureme_family_warmlead_test');
  PERFORM pg_temp.ev('demo_interacted', student_vh, t0 + interval '5 minutes', pid, NULL, NULL, NULL, 'email', 'crm', 'futureme_family_warmlead_test');
  INSERT INTO public.parent_briefs (generated_project_id, language, content, created_at)
  VALUES (pid, 'english', pg_temp.brief_content('Smart Line-Following Robot', 'robotics'), t0 + interval '10 minutes') RETURNING id INTO bid;
  PERFORM pg_temp.ev('parent_brief_generated', student_vh, t0 + interval '10 minutes', pid, bid, NULL, NULL, 'email', 'crm', 'futureme_family_warmlead_test');
  PERFORM pg_temp.ev('parent_brief_shared', student_vh, t0 + interval '11 minutes', pid, bid, NULL, 'whatsapp', 'email', 'crm', 'futureme_family_warmlead_test');
  PERFORM pg_temp.ev('parent_brief_opened', pg_temp.vh('parent-student'), t0 + interval '2 hours', pid, bid);
  PERFORM pg_temp.ev('counsellor_requested', student_vh, t0 + interval '25 minutes', pid, bid, NULL, NULL, 'email', 'crm', 'futureme_family_warmlead_test');
  INSERT INTO public.counsellor_requests (
    parent_brief_id, generated_project_id, contact_name, phone, who, language, consent,
    utm_source, utm_medium, utm_campaign, created_at, delivered, delivered_at, visitor_hash,
    status, assigned_to, next_follow_up_at, last_contacted_at, call_outcome, internal_notes, updated_at
  ) VALUES (
    bid, pid, 'Riya Sharma', '9812345670', 'student', 'english', true,
    'email', 'crm', 'futureme_family_warmlead_test', t0 + interval '25 minutes', true, t0 + interval '26 minutes',
    student_vh, 'follow_up', counsellor, now() + interval '1 day', t0 + interval '1 day', 'reached',
    'Interested in the AI track; wants to involve parents in the next call.', t0 + interval '1 day'
  );
  INSERT INTO public.pre_application_profiles (visitor_hash, generated_project_id, student_name, student_phone, email, city, state,
    qualification, passing_year, intended_course, consent_at, created_at, updated_at)
  VALUES (student_vh, pid, 'Riya Sharma', '9812345670', s_email, 'Hyderabad', 'Telangana',
    'class12_studying', '2026', 'btech_partner_university', t0 + interval '40 minutes', t0 + interval '40 minutes', t0 + interval '40 minutes')
  ON CONFLICT (visitor_hash) DO NOTHING;
  sess := gen_random_uuid();
  INSERT INTO public.engagement_sessions (id, visitor_hash, generated_project_id, started_at, last_heartbeat_at, active_seconds, heartbeat_count)
  VALUES (sess, student_vh, pid, t0, t0 + interval '21 minutes', 1260, 42);
  INSERT INTO public.engagement_heartbeats (session_id, visitor_hash, generated_project_id, active_seconds, created_at)
  SELECT sess, student_vh, pid, 30, t0 + g * interval '30 seconds' FROM generate_series(1, 42) g;

  INSERT INTO public.student_accounts (user_id, visitor_hash) VALUES (student, student_vh)
  ON CONFLICT (user_id) DO UPDATE SET visitor_hash = EXCLUDED.visitor_hash;

  RAISE NOTICE 'Done: % leads, 160 anonymous visitors, counsellor % and student % ready.', n_leads, c_email, s_email;
END $$;

-- ---------- 4. Check ----------
SELECT u.email, r.role FROM auth.users u JOIN public.user_roles r ON r.user_id = u.id
WHERE u.email IN ('counsellor@futureme.in', 'student@futureme.in') ORDER BY 2;
SELECT status, count(*) FROM public.counsellor_requests GROUP BY 1 ORDER BY 1;
