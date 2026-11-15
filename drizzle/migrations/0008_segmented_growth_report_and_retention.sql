ALTER TABLE public.growth_events ADD COLUMN IF NOT EXISTS entry_page text;
ALTER TABLE public.visitor_attribution ADD COLUMN IF NOT EXISTS entry_page text;
CREATE INDEX IF NOT EXISTS growth_events_project_idx ON public.growth_events (generated_project_id);

DROP FUNCTION IF EXISTS public.record_growth_event(text,text,uuid,text,text,text,text,text,text,text,text,text,text,text);
CREATE FUNCTION public.record_growth_event(
  _event text, _visitor_hash text,
  _generated_project_id uuid DEFAULT NULL, _referral_code text DEFAULT NULL, _channel text DEFAULT NULL,
  _utm_source text DEFAULT NULL, _utm_medium text DEFAULT NULL, _utm_campaign text DEFAULT NULL,
  _interest text DEFAULT NULL, _technology text DEFAULT NULL, _language text DEFAULT NULL,
  _class_status text DEFAULT NULL, _failure_kind text DEFAULT NULL, _cta text DEFAULT NULL,
  _entry_page text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  attr public.visitor_attribution%ROWTYPE;
  link public.referral_links%ROWTYPE;
  recent int;
  today date := (now() AT TIME ZONE 'utc')::date;
  key text;
  valid_ref text := NULL;
  inserted int;
BEGIN
  SELECT count(*) INTO recent FROM public.growth_events
  WHERE visitor_hash = _visitor_hash AND created_at > now() - interval '10 minutes';
  IF recent >= 200 THEN RETURN 'rate_limited'; END IF;

  IF _referral_code IS NOT NULL THEN
    SELECT * INTO link FROM public.referral_links WHERE code = _referral_code;
    IF FOUND AND link.owner_visitor_hash <> _visitor_hash THEN valid_ref := link.code; END IF;
  END IF;

  IF _event = 'referral_visit' THEN
    IF valid_ref IS NULL THEN RETURN 'ignored'; END IF;
    _generated_project_id := link.generated_project_id;
  END IF;

  -- First touch only: later visits never overwrite this row.
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
    ELSE NULL END;

  INSERT INTO public.growth_events (event_name, visitor_hash, generated_project_id, referral_code, channel,
    utm_source, utm_medium, utm_campaign, interest, technology, language, class_status, failure_kind, cta, dedupe_key, entry_page)
  VALUES (_event, _visitor_hash, _generated_project_id, attr.referral_code, _channel,
    attr.utm_source, attr.utm_medium, attr.utm_campaign, _interest, _technology, _language, _class_status,
    _failure_kind, _cta, key, _entry_page)
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN CASE WHEN inserted = 0 THEN 'duplicate' ELSE 'ok' END;
END;
$$;
REVOKE ALL ON FUNCTION public.record_growth_event(text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_growth_event(text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text) TO service_role;

DROP FUNCTION IF EXISTS public.growth_report(date,date,text,text,text,text,text);
-- Admin report. With no answer filter every number covers all visitors.
-- With an answer filter, the cohort is visitors who completed a matching discovery;
-- answer-bearing events must match the answers and project-bound events must belong
-- to a matching project. Discovery starts carry no answers, so starts are null in a segment.
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
      AND (_language IS NULL OR gp.language = _language) AND (_class_status IS NULL OR gp.class_status = _class_status)) AS project_match
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
        WHEN b.event_name IN ('project_viewed','project_shared') THEN b.project_match
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
    count(*) FILTER (WHERE event_name='cta_clicked' AND cta='explore_niat') AS niat_modal_opens,
    count(*) FILTER (WHERE event_name='cta_clicked' AND cta='visit_niat') AS niat_outbound,
    count(DISTINCT visitor_hash) FILTER (WHERE event_name='cta_clicked' AND cta='visit_niat') AS niat_outbound_visitors,
    count(*) FILTER (WHERE event_name='cta_clicked' AND cta='visit_niat' AND referral_code IS NOT NULL) AS ref_niat_outbound,
    count(*) FILTER (WHERE event_name='project_viewed') AS views
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

CREATE OR REPLACE FUNCTION public.purge_expired_growth_data(_attempt_days int DEFAULT 30, _event_days int DEFAULT 395)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE a int; e int;
BEGIN
  IF _attempt_days < 2 OR _event_days < 90 THEN RAISE EXCEPTION 'retention period too short'; END IF;
  DELETE FROM public.generation_attempts WHERE created_at < now() - make_interval(days => _attempt_days);
  GET DIAGNOSTICS a = ROW_COUNT;
  DELETE FROM public.growth_events WHERE created_at < now() - make_interval(days => _event_days);
  GET DIAGNOSTICS e = ROW_COUNT;
  RETURN jsonb_build_object('attempts_deleted', a, 'events_deleted', e);
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_growth_data(int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_growth_data(int,int) TO service_role;