ALTER TABLE public.counsellor_requests
  ADD COLUMN delivered boolean NOT NULL DEFAULT false,
  ADD COLUMN delivered_at timestamptz;

CREATE INDEX counsellor_requests_undelivered_idx
  ON public.counsellor_requests (delivered, created_at DESC);

CREATE TABLE public.counsellor_request_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.counsellor_request_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.counsellor_request_attempts TO service_role;
ALTER TABLE public.counsellor_request_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX counsellor_request_attempts_visitor_idx
  ON public.counsellor_request_attempts (visitor_hash, created_at DESC);
CREATE INDEX counsellor_request_attempts_created_idx
  ON public.counsellor_request_attempts (created_at DESC);

CREATE FUNCTION public.claim_counsellor_request_slot(
  _visitor_hash text,
  _generated_project_id uuid,
  _phone text,
  _visitor_limit int DEFAULT 3,
  _visitor_window_seconds int DEFAULT 3600,
  _global_per_day int DEFAULT 200
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_count int;
  v_oldest timestamptz;
  v_existing uuid;
  new_id uuid;
BEGIN
  IF _visitor_limit < 1 OR _visitor_limit > 100
    OR _visitor_window_seconds < 60 OR _visitor_window_seconds > 86400
    OR _global_per_day < 1 OR _global_per_day > 100000 THEN
    RAISE EXCEPTION 'invalid counsellor request limit';
  END IF;

  -- One lock makes both duplicate detection and limit claims race-safe.
  PERFORM pg_advisory_xact_lock(hashtext('claim_counsellor_request_slot'));

  SELECT id INTO v_existing
  FROM public.counsellor_requests
  WHERE generated_project_id = _generated_project_id
    AND phone = _phone
    AND created_at > now() - interval '24 hours'
  ORDER BY created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'allowed', true, 'duplicate', true, 'request_id', v_existing
    );
  END IF;

  SELECT count(*), min(created_at) INTO v_count, v_oldest
  FROM public.counsellor_request_attempts
  WHERE visitor_hash = _visitor_hash
    AND created_at > now() - make_interval(secs => _visitor_window_seconds);
  IF v_count >= _visitor_limit THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'visitor',
      'retry_after_seconds', GREATEST(1, ceil(extract(epoch FROM (
        v_oldest + make_interval(secs => _visitor_window_seconds) - now()
      )))::int)
    );
  END IF;

  SELECT count(*), min(created_at) INTO v_count, v_oldest
  FROM public.counsellor_request_attempts
  WHERE created_at > now() - interval '1 day';
  IF v_count >= _global_per_day THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'global',
      'retry_after_seconds', GREATEST(1, ceil(extract(epoch FROM (
        v_oldest + interval '1 day' - now()
      )))::int)
    );
  END IF;

  INSERT INTO public.counsellor_request_attempts (visitor_hash)
  VALUES (_visitor_hash) RETURNING id INTO new_id;
  RETURN jsonb_build_object(
    'allowed', true, 'duplicate', false, 'attempt_id', new_id,
    'remaining', _visitor_limit - (
      SELECT count(*) FROM public.counsellor_request_attempts
      WHERE visitor_hash = _visitor_hash
        AND created_at > now() - make_interval(secs => _visitor_window_seconds)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.claim_counsellor_request_slot(text,uuid,text,int,int,int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_counsellor_request_slot(text,uuid,text,int,int,int)
  TO service_role;

CREATE OR REPLACE FUNCTION public.growth_report(
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
    count(*) FILTER (WHERE event_name='counsellor_requested' AND failure_kind NOT IN ('visitor_limit','global_limit')) AS counsellor_requests,
    count(*) FILTER (WHERE event_name='cta_clicked' AND cta='start_application') AS application_clicks
  FROM e
)
SELECT jsonb_build_object(
  'totals', (SELECT to_jsonb(t) || jsonb_build_object(
    'counsellor_undelivered', (
      SELECT count(*)
      FROM public.counsellor_requests cr
      JOIN public.generated_projects gp ON gp.id = cr.generated_project_id
      WHERE cr.delivered = false
        AND (cr.created_at AT TIME ZONE 'utc')::date BETWEEN _from AND _to
        AND (_utm_source IS NULL OR cr.utm_source = _utm_source)
        AND (_utm_medium IS NULL OR cr.utm_medium = _utm_medium)
        AND (_utm_campaign IS NULL OR cr.utm_campaign = _utm_campaign)
        AND (_interest IS NULL OR gp.interest = _interest)
        AND (_technology IS NULL OR gp.technology = _technology)
        AND (_language IS NULL OR cr.language = _language)
        AND (_class_status IS NULL OR gp.class_status = _class_status)
    )
  ) FROM t),
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

CREATE OR REPLACE FUNCTION public.purge_expired_growth_data(_attempt_days int DEFAULT 30, _event_days int DEFAULT 395, _counsellor_days int DEFAULT 180)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE a int; e int; c int; ca int;
BEGIN
  IF _attempt_days < 2 OR _event_days < 90 OR _counsellor_days < 30 THEN RAISE EXCEPTION 'retention period too short'; END IF;
  DELETE FROM public.generation_attempts WHERE created_at < now() - make_interval(days => _attempt_days);
  GET DIAGNOSTICS a = ROW_COUNT;
  DELETE FROM public.counsellor_request_attempts WHERE created_at < now() - make_interval(days => _attempt_days);
  GET DIAGNOSTICS ca = ROW_COUNT;
  DELETE FROM public.growth_events WHERE created_at < now() - make_interval(days => _event_days);
  GET DIAGNOSTICS e = ROW_COUNT;
  DELETE FROM public.counsellor_requests WHERE created_at < now() - make_interval(days => _counsellor_days);
  GET DIAGNOSTICS c = ROW_COUNT;
  RETURN jsonb_build_object(
    'attempts_deleted', a, 'events_deleted', e,
    'counsellor_requests_deleted', c, 'counsellor_attempts_deleted', ca
  );
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_growth_data(int,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_growth_data(int,int,int) TO service_role;
