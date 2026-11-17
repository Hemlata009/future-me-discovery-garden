CREATE OR REPLACE FUNCTION public.referral_journey_report(
  _from date, _to date,
  _utm_source text DEFAULT NULL, _utm_medium text DEFAULT NULL, _utm_campaign text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
WITH ev AS (
  SELECT * FROM public.growth_events ge
  WHERE ge.event_date BETWEEN _from AND _to
    AND (_utm_source IS NULL OR ge.utm_source = _utm_source)
    AND (_utm_medium IS NULL OR ge.utm_medium = _utm_medium)
    AND (_utm_campaign IS NULL OR ge.utm_campaign = _utm_campaign)
),
referred AS (
  SELECT ev.visitor_hash, min(ev.created_at) AS first_at
  FROM ev JOIN public.referral_links rl ON rl.code = ev.referral_code
  WHERE ev.event_name = 'referral_visit' AND rl.owner_visitor_hash <> ev.visitor_hash
  GROUP BY ev.visitor_hash
),
steps AS (
  SELECT r.visitor_hash,
    bool_or(e.event_name = 'discovery_started') AS started,
    bool_or(e.event_name = 'discovery_completed') AS completed,
    bool_or(e.event_name = 'cta_clicked' AND e.cta = 'start_application') AS applied
  FROM referred r LEFT JOIN ev e ON e.visitor_hash = r.visitor_hash AND e.created_at >= r.first_at
  GROUP BY r.visitor_hash
)
SELECT jsonb_build_object(
  'referred_visitors', count(*),
  'started_discovery', count(*) FILTER (WHERE started),
  'completed_discovery', count(*) FILTER (WHERE started AND completed),
  'application_clicks', count(*) FILTER (WHERE started AND applied)
) FROM steps;
$$;
REVOKE ALL ON FUNCTION public.referral_journey_report(date,date,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.referral_journey_report(date,date,text,text,text) TO service_role;