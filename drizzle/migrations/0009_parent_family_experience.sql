CREATE TABLE public.parent_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_project_id uuid NOT NULL REFERENCES public.generated_projects(id) ON DELETE CASCADE,
  language text NOT NULL CHECK (language IN ('english','hindi','telugu')),
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.parent_briefs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.parent_briefs TO service_role;
ALTER TABLE public.parent_briefs ENABLE ROW LEVEL SECURITY;
CREATE INDEX parent_briefs_project_idx ON public.parent_briefs (generated_project_id);

CREATE TABLE public.parent_question_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_brief_id uuid NOT NULL REFERENCES public.parent_briefs(id) ON DELETE CASCADE,
  visitor_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.parent_question_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.parent_question_attempts TO service_role;
ALTER TABLE public.parent_question_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX parent_question_attempts_limit_idx ON public.parent_question_attempts (parent_brief_id, visitor_hash, created_at);

CREATE TABLE public.counsellor_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_brief_id uuid REFERENCES public.parent_briefs(id) ON DELETE SET NULL,
  generated_project_id uuid NOT NULL REFERENCES public.generated_projects(id) ON DELETE CASCADE,
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 1 AND 80),
  phone text NOT NULL CHECK (char_length(phone) <= 20),
  who text NOT NULL CHECK (who IN ('student','parent')),
  language text NOT NULL CHECK (language IN ('english','hindi','telugu')),
  consent boolean NOT NULL CHECK (consent = true),
  referral_code text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.counsellor_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.counsellor_requests TO authenticated;
GRANT ALL ON public.counsellor_requests TO service_role;
ALTER TABLE public.counsellor_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read counsellor requests" ON public.counsellor_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX counsellor_requests_created_idx ON public.counsellor_requests (created_at DESC);

ALTER TABLE public.growth_events ADD COLUMN parent_brief_id uuid REFERENCES public.parent_briefs(id) ON DELETE CASCADE;
CREATE INDEX growth_events_parent_brief_idx ON public.growth_events (parent_brief_id, event_name);
ALTER TABLE public.growth_events DROP CONSTRAINT growth_events_event_name_check;
ALTER TABLE public.growth_events ADD CONSTRAINT growth_events_event_name_check CHECK (event_name IN (
  'landing_visit','discovery_started','discovery_completed','generation_succeeded','generation_failed',
  'project_viewed','project_shared','referral_visit','cta_clicked','parent_brief_generated',
  'parent_brief_failed','parent_brief_shared','parent_brief_opened','parent_question_asked','counsellor_requested'
));

DROP FUNCTION IF EXISTS public.record_growth_event(text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text);
CREATE FUNCTION public.record_growth_event(
  _event text, _visitor_hash text,
  _generated_project_id uuid DEFAULT NULL, _referral_code text DEFAULT NULL, _channel text DEFAULT NULL,
  _utm_source text DEFAULT NULL, _utm_medium text DEFAULT NULL, _utm_campaign text DEFAULT NULL,
  _interest text DEFAULT NULL, _technology text DEFAULT NULL, _language text DEFAULT NULL,
  _class_status text DEFAULT NULL, _failure_kind text DEFAULT NULL, _cta text DEFAULT NULL,
  _entry_page text DEFAULT NULL, _parent_brief_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  attr public.visitor_attribution%ROWTYPE;
  link public.referral_links%ROWTYPE;
  brief public.parent_briefs%ROWTYPE;
  recent int;
  today date := (now() AT TIME ZONE 'utc')::date;
  key text;
  valid_ref text := NULL;
  inserted int;
BEGIN
  SELECT count(*) INTO recent FROM public.growth_events
  WHERE visitor_hash = _visitor_hash AND created_at > now() - interval '10 minutes';
  IF recent >= 200 THEN RETURN 'rate_limited'; END IF;

  IF _parent_brief_id IS NOT NULL THEN
    SELECT * INTO brief FROM public.parent_briefs WHERE id = _parent_brief_id;
    IF NOT FOUND THEN RETURN 'ignored'; END IF;
    IF _generated_project_id IS NOT NULL AND _generated_project_id <> brief.generated_project_id THEN
      RETURN 'ignored';
    END IF;
    _generated_project_id := brief.generated_project_id;
  END IF;

  IF _referral_code IS NOT NULL THEN
    SELECT * INTO link FROM public.referral_links WHERE code = _referral_code;
    IF FOUND AND link.owner_visitor_hash <> _visitor_hash THEN valid_ref := link.code; END IF;
  END IF;

  IF _event = 'referral_visit' THEN
    IF valid_ref IS NULL THEN RETURN 'ignored'; END IF;
    _generated_project_id := link.generated_project_id;
  END IF;

  INSERT INTO public.visitor_attribution (visitor_hash, utm_source, utm_medium, utm_campaign, referral_code, entry_page)
  VALUES (_visitor_hash, _utm_source, _utm_medium, _utm_campaign, valid_ref, _entry_page)
  ON CONFLICT (visitor_hash) DO NOTHING;
  SELECT * INTO attr FROM public.visitor_attribution WHERE visitor_hash = _visitor_hash;

  key := CASE _event
    WHEN 'landing_visit' THEN _event || ':' || _visitor_hash || ':' || today
    WHEN 'discovery_started' THEN _event || ':' || _visitor_hash || ':' || today
    WHEN 'discovery_completed' THEN _event || ':' || _visitor_hash || ':' || today
    WHEN 'project_viewed' THEN _event || ':' || _visitor_hash || ':' || COALESCE(_generated_project_id::text, '')
    WHEN 'project_shared' THEN _event || ':' || _visitor_hash || ':' || COALESCE(_generated_project_id::text, '') || ':' || COALESCE(_channel, '')
    WHEN 'referral_visit' THEN _event || ':' || _visitor_hash || ':' || valid_ref
    WHEN 'cta_clicked' THEN _event || ':' || _visitor_hash || ':' || COALESCE(_cta, '') || ':' || COALESCE(_generated_project_id::text, '') || ':' || today
    WHEN 'parent_brief_generated' THEN _event || ':' || COALESCE(_parent_brief_id::text, '')
    WHEN 'parent_brief_shared' THEN _event || ':' || _visitor_hash || ':' || COALESCE(_parent_brief_id::text, '') || ':' || COALESCE(_channel, '')
    WHEN 'parent_brief_opened' THEN _event || ':' || _visitor_hash || ':' || COALESCE(_parent_brief_id::text, '')
    ELSE NULL END;

  INSERT INTO public.growth_events (
    event_name, visitor_hash, generated_project_id, parent_brief_id, referral_code, channel,
    utm_source, utm_medium, utm_campaign, interest, technology, language, class_status,
    failure_kind, cta, dedupe_key, entry_page
  ) VALUES (
    _event, _visitor_hash, _generated_project_id, _parent_brief_id, attr.referral_code, _channel,
    attr.utm_source, attr.utm_medium, attr.utm_campaign, _interest, _technology, _language, _class_status,
    _failure_kind, _cta, key, _entry_page
  ) ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN CASE WHEN inserted = 0 THEN 'duplicate' ELSE 'ok' END;
END;
$$;
REVOKE ALL ON FUNCTION public.record_growth_event(text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_growth_event(text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,uuid) TO service_role;

CREATE FUNCTION public.claim_parent_question(_brief_id uuid, _visitor_hash text, _limit int DEFAULT 3)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE v_count int; new_id uuid;
BEGIN
  IF _limit < 1 OR _limit > 20 THEN RAISE EXCEPTION 'invalid question limit'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(_brief_id::text || ':' || _visitor_hash));
  SELECT count(*) INTO v_count FROM public.parent_question_attempts
  WHERE parent_brief_id = _brief_id AND visitor_hash = _visitor_hash;
  IF v_count >= _limit THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0);
  END IF;
  INSERT INTO public.parent_question_attempts (parent_brief_id, visitor_hash)
  VALUES (_brief_id, _visitor_hash) RETURNING id INTO new_id;
  RETURN jsonb_build_object('allowed', true, 'attempt_id', new_id, 'remaining', _limit - v_count - 1);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_parent_question(uuid,text,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_parent_question(uuid,text,int) TO service_role;

DROP FUNCTION IF EXISTS public.growth_report(date,date,text,text,text,text,text,text,text);
CREATE FUNCTION public.growth_report(
  _from date, _to date,
  _utm_source text DEFAULT NULL, _utm_medium text DEFAULT NULL, _utm_campaign text DEFAULT NULL,
  _interest text DEFAULT NULL, _technology text DEFAULT NULL, _language text DEFAULT NULL, _class_status text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
WITH params AS (
  SELECT (_interest IS NOT NULL OR _technology IS NOT NULL OR _language IS NOT NULL OR _class_status IS NOT NULL) AS seg
),
base AS (
  SELECT ge.*,
    CASE WHEN ge.referral_code IS NOT NULL THEN 'referral' WHEN ge.utm_source IS NOT NULL OR ge.utm_campaign IS NOT NULL THEN 'campaign' ELSE 'direct' END AS acquisition,
    CASE WHEN ge.failure_kind LIKE 'anthropic:%' OR ge.failure_kind IN ('invalid_response','save') THEN 'ai'
         WHEN ge.failure_kind IN ('config','visitor_limit','global_limit','limit_check') THEN 'rejected'
         ELSE 'other' END AS fail_stage,
    ((_interest IS NULL OR ge.interest = _interest) AND (_technology IS NULL OR ge.technology = _technology)
      AND (_language IS NULL OR ge.language = _language) AND (_class_status IS NULL OR ge.class_status = _class_status)) AS answers_match,
    (gp.id IS NOT NULL AND (_interest IS NULL OR gp.interest = _interest) AND (_technology IS NULL OR gp.technology = _technology)
      AND (_language IS NULL OR gp.language = _language) AND (_class_status IS NULL OR gp.class_status = _class_status)) AS project_match,
    (ge.referral_code IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.referral_links rl
      WHERE rl.code = ge.referral_code AND rl.owner_visitor_hash <> ge.visitor_hash
    )) AS qualified_referral
  FROM public.growth_events ge
  LEFT JOIN public.generated_projects gp ON gp.id = ge.generated_project_id
  WHERE ge.event_date BETWEEN _from AND _to
    AND (_utm_source IS NULL OR ge.utm_source = _utm_source)
    AND (_utm_medium IS NULL OR ge.utm_medium = _utm_medium)
    AND (_utm_campaign IS NULL OR ge.utm_campaign = _utm_campaign)
),
cohort AS (
  SELECT DISTINCT visitor_hash FROM base WHERE event_name = 'discovery_completed' AND answers_match
),
e AS (
  SELECT b.* FROM base b, params p
  WHERE NOT p.seg OR (
    b.visitor_hash IN (SELECT visitor_hash FROM cohort) AND (
      CASE
        WHEN b.event_name IN ('discovery_completed','generation_succeeded','generation_failed') THEN b.answers_match
        WHEN b.event_name IN ('project_viewed','project_shared','parent_brief_generated','parent_brief_failed','parent_brief_shared','parent_brief_opened','parent_question_asked','counsellor_requested') THEN b.project_match
        WHEN b.event_name = 'cta_clicked' AND b.generated_project_id IS NOT NULL THEN b.project_match
        WHEN b.event_name = 'discovery_started' THEN false
        ELSE true
      END))
),
t AS (
  SELECT
    (SELECT seg FROM params) AS segmented,
    count(DISTINCT visitor_hash) AS visitors,
    CASE WHEN (SELECT seg FROM params) THEN NULL ELSE count(*) FILTER (WHERE event_name='discovery_started') END AS starts,
    count(*) FILTER (WHERE event_name='discovery_completed') AS completions,
    count(*) FILTER (WHERE event_name='generation_succeeded') AS gen_ok,
    count(*) FILTER (WHERE event_name='generation_failed' AND fail_stage='ai') AS gen_fail,
    count(*) FILTER (WHERE event_name='generation_failed' AND fail_stage='rejected') AS gen_rejected,
    count(*) FILTER (WHERE event_name='project_shared') AS shares,
    count(DISTINCT generated_project_id) FILTER (WHERE event_name='project_shared') AS shared_projects,
    count(*) FILTER (WHERE event_name='referral_visit') AS ref_visits,
    count(DISTINCT visitor_hash) FILTER (WHERE event_name='referral_visit') AS ref_visitors,
    count(*) FILTER (WHERE event_name='discovery_started' AND referral_code IS NOT NULL) AS ref_starts,
    count(*) FILTER (WHERE event_name='generation_succeeded' AND referral_code IS NOT NULL) AS ref_gens,
    count(DISTINCT visitor_hash) FILTER (WHERE event_name='discovery_completed' AND qualified_referral) AS qualified_referrals,
    count(*) FILTER (WHERE event_name='cta_clicked' AND cta='explore_niat') AS niat_modal_opens,
    count(*) FILTER (WHERE event_name='cta_clicked' AND cta='visit_niat') AS niat_outbound,
    count(DISTINCT visitor_hash) FILTER (WHERE event_name='cta_clicked' AND cta='visit_niat') AS niat_outbound_visitors,
    count(*) FILTER (WHERE event_name='cta_clicked' AND cta='visit_niat' AND referral_code IS NOT NULL) AS ref_niat_outbound,
    count(*) FILTER (WHERE event_name='project_viewed') AS views,
    count(DISTINCT parent_brief_id) FILTER (WHERE event_name='parent_brief_generated') AS briefs_generated,
    count(DISTINCT parent_brief_id) FILTER (WHERE event_name='parent_brief_shared') AS briefs_shared,
    count(DISTINCT parent_brief_id) FILTER (WHERE event_name='parent_brief_opened') AS briefs_opened,
    count(*) FILTER (WHERE event_name='parent_question_asked') AS parent_questions,
    count(*) FILTER (WHERE event_name='counsellor_requested') AS counsellor_requests,
    count(*) FILTER (WHERE event_name='cta_clicked' AND cta='start_application') AS application_clicks
  FROM e
)
SELECT jsonb_build_object(
  'totals', (SELECT to_jsonb(t) FROM t),
  'shares_by_channel', COALESCE((SELECT jsonb_object_agg(channel, n) FROM (SELECT channel, count(*) n FROM e WHERE event_name='project_shared' GROUP BY channel) s), '{}'::jsonb),
  'failures_by_kind', COALESCE((SELECT jsonb_object_agg(COALESCE(failure_kind,'unknown'), n) FROM (SELECT failure_kind, count(*) n FROM e WHERE event_name='generation_failed' GROUP BY failure_kind) s), '{}'::jsonb),
  'entry_pages', COALESCE((SELECT jsonb_agg(x) FROM (SELECT COALESCE(entry_page,'unknown') AS name, count(DISTINCT visitor_hash) AS value FROM e WHERE event_name='landing_visit' GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
  'daily', COALESCE((SELECT jsonb_agg(d ORDER BY d.day) FROM (
      SELECT g::date AS day,
        (SELECT count(DISTINCT visitor_hash) FROM e WHERE event_date=g::date) AS visitors,
        (SELECT count(*) FROM e WHERE event_date=g::date AND event_name='generation_succeeded') AS generations,
        (SELECT count(*) FROM e WHERE event_date=g::date AND event_name='referral_visit') AS referral_visits
      FROM generate_series(_from, _to, interval '1 day') g) d), '[]'::jsonb),
  'interests', COALESCE((SELECT jsonb_agg(x) FROM (SELECT interest AS name, count(*) AS value FROM e WHERE event_name='generation_succeeded' GROUP BY interest ORDER BY 2 DESC) x), '[]'::jsonb),
  'technologies', COALESCE((SELECT jsonb_agg(x) FROM (SELECT technology AS name, count(*) AS value FROM e WHERE event_name='generation_succeeded' GROUP BY technology ORDER BY 2 DESC) x), '[]'::jsonb),
  'languages', COALESCE((SELECT jsonb_agg(x) FROM (SELECT language AS name, count(*) AS value FROM e WHERE event_name='generation_succeeded' GROUP BY language ORDER BY 2 DESC) x), '[]'::jsonb),
  'campaigns', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(utm_source,'(none)') AS source, COALESCE(utm_medium,'(none)') AS medium, COALESCE(utm_campaign,'(none)') AS campaign,
        count(DISTINCT visitor_hash) AS visitors,
        count(*) FILTER (WHERE event_name='generation_succeeded') AS generations,
        count(*) FILTER (WHERE event_name='project_shared') AS shares,
        count(*) FILTER (WHERE event_name='cta_clicked' AND cta='visit_niat') AS niat_outbound
      FROM e WHERE utm_source IS NOT NULL OR utm_campaign IS NOT NULL GROUP BY 1,2,3 ORDER BY 4 DESC) x), '[]'::jsonb),
  'acquisition', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT acquisition AS name, count(DISTINCT visitor_hash) AS visitors,
        count(*) FILTER (WHERE event_name='generation_succeeded') AS generations,
        count(DISTINCT visitor_hash) FILTER (WHERE event_name='cta_clicked' AND cta='visit_niat') AS outbound_visitors
      FROM e GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
  'source_options', COALESCE((SELECT jsonb_agg(DISTINCT utm_source) FROM public.growth_events WHERE utm_source IS NOT NULL), '[]'::jsonb),
  'medium_options', COALESCE((SELECT jsonb_agg(DISTINCT utm_medium) FROM public.growth_events WHERE utm_medium IS NOT NULL), '[]'::jsonb),
  'campaign_options', COALESCE((SELECT jsonb_agg(DISTINCT utm_campaign) FROM public.growth_events WHERE utm_campaign IS NOT NULL), '[]'::jsonb)
);
$$;
REVOKE ALL ON FUNCTION public.growth_report(date,date,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.growth_report(date,date,text,text,text,text,text,text,text) TO service_role;

DROP FUNCTION IF EXISTS public.purge_expired_growth_data(int,int);
CREATE FUNCTION public.purge_expired_growth_data(_attempt_days int DEFAULT 30, _event_days int DEFAULT 395, _counsellor_days int DEFAULT 180)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE a int; e int; c int;
BEGIN
  IF _attempt_days < 2 OR _event_days < 90 OR _counsellor_days < 30 THEN RAISE EXCEPTION 'retention period too short'; END IF;
  DELETE FROM public.generation_attempts WHERE created_at < now() - make_interval(days => _attempt_days);
  GET DIAGNOSTICS a = ROW_COUNT;
  DELETE FROM public.growth_events WHERE created_at < now() - make_interval(days => _event_days);
  GET DIAGNOSTICS e = ROW_COUNT;
  DELETE FROM public.counsellor_requests WHERE created_at < now() - make_interval(days => _counsellor_days);
  GET DIAGNOSTICS c = ROW_COUNT;
  RETURN jsonb_build_object('attempts_deleted', a, 'events_deleted', e, 'counsellor_requests_deleted', c);
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_growth_data(int,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_growth_data(int,int,int) TO service_role;
