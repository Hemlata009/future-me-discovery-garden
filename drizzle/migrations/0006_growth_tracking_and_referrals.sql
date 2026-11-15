ALTER TABLE public.generated_projects ADD COLUMN owner_visitor_hash text;

CREATE TABLE public.visitor_attribution (
  visitor_hash text PRIMARY KEY,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referral_code text,
  first_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.visitor_attribution TO authenticated;
GRANT ALL ON public.visitor_attribution TO service_role;
ALTER TABLE public.visitor_attribution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read attribution" ON public.visitor_attribution FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.referral_links (
  code text PRIMARY KEY,
  generated_project_id uuid NOT NULL REFERENCES public.generated_projects(id) ON DELETE CASCADE,
  owner_visitor_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (generated_project_id, owner_visitor_hash)
);
GRANT SELECT ON public.referral_links TO authenticated;
GRANT ALL ON public.referral_links TO service_role;
ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read referral links" ON public.referral_links FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.growth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL CHECK (event_name IN ('landing_visit','discovery_started','discovery_completed','generation_succeeded','generation_failed','project_viewed','project_shared','referral_visit','cta_clicked')),
  visitor_hash text NOT NULL,
  generated_project_id uuid,
  referral_code text,
  channel text CHECK (channel IS NULL OR channel IN ('copy','whatsapp')),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  interest text,
  technology text,
  language text,
  class_status text,
  failure_kind text,
  cta text,
  dedupe_key text UNIQUE,
  event_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.growth_events TO authenticated;
GRANT ALL ON public.growth_events TO service_role;
ALTER TABLE public.growth_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read growth events" ON public.growth_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX growth_events_date_idx ON public.growth_events (event_date, event_name);
CREATE INDEX growth_events_visitor_idx ON public.growth_events (visitor_hash, created_at DESC);

-- Records one event: first-touch attribution, self-referral and spam guards, dedupe.
CREATE OR REPLACE FUNCTION public.record_growth_event(
  _event text, _visitor_hash text,
  _generated_project_id uuid DEFAULT NULL, _referral_code text DEFAULT NULL, _channel text DEFAULT NULL,
  _utm_source text DEFAULT NULL, _utm_medium text DEFAULT NULL, _utm_campaign text DEFAULT NULL,
  _interest text DEFAULT NULL, _technology text DEFAULT NULL, _language text DEFAULT NULL,
  _class_status text DEFAULT NULL, _failure_kind text DEFAULT NULL, _cta text DEFAULT NULL
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

  INSERT INTO public.visitor_attribution (visitor_hash, utm_source, utm_medium, utm_campaign, referral_code)
  VALUES (_visitor_hash, _utm_source, _utm_medium, _utm_campaign, valid_ref)
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
    utm_source, utm_medium, utm_campaign, interest, technology, language, class_status, failure_kind, cta, dedupe_key)
  VALUES (_event, _visitor_hash, _generated_project_id, attr.referral_code, _channel,
    attr.utm_source, attr.utm_medium, attr.utm_campaign, _interest, _technology, _language, _class_status,
    _failure_kind, _cta, key)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.record_growth_event(text,text,uuid,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_growth_event(text,text,uuid,text,text,text,text,text,text,text,text,text,text,text) TO service_role;

-- Admin report. Answer filters (interest/technology/language/class_status) narrow the
-- events that carry answers: discovery completions and generations.
CREATE OR REPLACE FUNCTION public.growth_report(
  _from date, _to date, _campaign text DEFAULT NULL, _interest text DEFAULT NULL,
  _technology text DEFAULT NULL, _language text DEFAULT NULL, _class_status text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
WITH e AS (
  SELECT *, CASE WHEN referral_code IS NOT NULL THEN 'referral' WHEN utm_source IS NOT NULL THEN 'campaign' ELSE 'direct' END AS acquisition
  FROM public.growth_events
  WHERE event_date BETWEEN _from AND _to
    AND (_campaign IS NULL OR utm_campaign = _campaign)
    AND (event_name NOT IN ('discovery_completed','generation_succeeded','generation_failed') OR (
      (_interest IS NULL OR interest = _interest) AND (_technology IS NULL OR technology = _technology)
      AND (_language IS NULL OR language = _language) AND (_class_status IS NULL OR class_status = _class_status)))
),
t AS (
  SELECT
    count(DISTINCT visitor_hash) AS visitors,
    count(*) FILTER (WHERE event_name='discovery_started') AS starts,
    count(*) FILTER (WHERE event_name='discovery_completed') AS completions,
    count(*) FILTER (WHERE event_name='generation_succeeded') AS gen_ok,
    count(*) FILTER (WHERE event_name='generation_failed') AS gen_fail,
    count(*) FILTER (WHERE event_name='project_shared') AS shares,
    count(DISTINCT generated_project_id) FILTER (WHERE event_name='project_shared') AS shared_projects,
    count(*) FILTER (WHERE event_name='referral_visit') AS ref_visits,
    count(DISTINCT visitor_hash) FILTER (WHERE event_name='referral_visit') AS ref_visitors,
    count(*) FILTER (WHERE event_name='discovery_started' AND referral_code IS NOT NULL) AS ref_starts,
    count(*) FILTER (WHERE event_name='generation_succeeded' AND referral_code IS NOT NULL) AS ref_gens,
    count(*) FILTER (WHERE event_name='cta_clicked') AS cta,
    count(*) FILTER (WHERE event_name='cta_clicked' AND referral_code IS NOT NULL) AS ref_cta,
    count(*) FILTER (WHERE event_name='project_viewed') AS views
  FROM e
)
SELECT jsonb_build_object(
  'totals', (SELECT to_jsonb(t) FROM t),
  'shares_by_channel', COALESCE((SELECT jsonb_object_agg(channel, n) FROM (SELECT channel, count(*) n FROM e WHERE event_name='project_shared' GROUP BY channel) s), '{}'::jsonb),
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
        count(*) FILTER (WHERE event_name='cta_clicked') AS cta
      FROM e WHERE utm_source IS NOT NULL OR utm_campaign IS NOT NULL GROUP BY 1,2,3 ORDER BY 4 DESC) x), '[]'::jsonb),
  'acquisition', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT acquisition AS name, count(DISTINCT visitor_hash) AS visitors,
        count(*) FILTER (WHERE event_name='generation_succeeded') AS generations,
        count(DISTINCT visitor_hash) FILTER (WHERE event_name='cta_clicked') AS cta_visitors
      FROM e GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
  'campaign_options', COALESCE((SELECT jsonb_agg(DISTINCT utm_campaign) FROM public.growth_events WHERE utm_campaign IS NOT NULL), '[]'::jsonb)
);
$$;
REVOKE ALL ON FUNCTION public.growth_report(date,date,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.growth_report(date,date,text,text,text,text,text) TO service_role;

COMMENT ON TABLE public.project_shares IS 'DEPRECATED: replaced by growth_events (event_name=project_shared)';
COMMENT ON TABLE public.referral_visits IS 'DEPRECATED: replaced by growth_events (event_name=referral_visit)';
COMMENT ON TABLE public.referral_invitations IS 'DEPRECATED: replaced by referral_links';
COMMENT ON TABLE public.visits IS 'DEPRECATED: replaced by growth_events (event_name=landing_visit)';