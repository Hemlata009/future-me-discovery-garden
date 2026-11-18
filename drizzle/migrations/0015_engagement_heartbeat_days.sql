CREATE TABLE public.engagement_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.engagement_sessions(id) ON DELETE CASCADE,
  visitor_hash text NOT NULL CHECK (visitor_hash ~ '^[0-9a-f]{64}$'),
  generated_project_id uuid REFERENCES public.generated_projects(id) ON DELETE CASCADE,
  active_seconds integer NOT NULL CHECK (active_seconds BETWEEN 0 AND 45),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.engagement_heartbeats FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.engagement_heartbeats TO service_role;
ALTER TABLE public.engagement_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE INDEX engagement_heartbeats_visitor_day_idx ON public.engagement_heartbeats (visitor_hash, created_at DESC);
CREATE INDEX engagement_heartbeats_created_idx ON public.engagement_heartbeats (created_at);

CREATE OR REPLACE FUNCTION public.record_engagement_heartbeat(
  _session_id uuid,
  _visitor_hash text,
  _generated_project_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  session public.engagement_sessions%ROWTYPE;
  elapsed numeric;
  increment int;
  daily_sessions int;
  daily_heartbeats bigint;
BEGIN
  IF _visitor_hash !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('result', 'ignored'); END IF;
  IF _generated_project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.generated_projects WHERE id = _generated_project_id
  ) THEN RETURN jsonb_build_object('result', 'ignored'); END IF;

  PERFORM pg_advisory_xact_lock(hashtext(_session_id::text));
  SELECT * INTO session FROM public.engagement_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    SELECT count(*) INTO daily_sessions FROM public.engagement_sessions
    WHERE visitor_hash = _visitor_hash AND started_at > now() - interval '1 day';
    IF daily_sessions >= 24 THEN RETURN jsonb_build_object('result', 'rate_limited'); END IF;
    INSERT INTO public.engagement_sessions (id, visitor_hash, generated_project_id)
    VALUES (_session_id, _visitor_hash, _generated_project_id);
    RETURN jsonb_build_object('result', 'ok', 'active_seconds', 0, 'heartbeat_count', 1);
  END IF;

  IF session.visitor_hash <> _visitor_hash
    OR session.generated_project_id IS DISTINCT FROM _generated_project_id THEN
    RETURN jsonb_build_object('result', 'ignored');
  END IF;
  IF now() - session.started_at > interval '4 hours'
    OR session.active_seconds >= 14400 OR session.heartbeat_count >= 480 THEN
    RETURN jsonb_build_object('result', 'expired');
  END IF;

  SELECT COALESCE(sum(heartbeat_count), 0) INTO daily_heartbeats
  FROM public.engagement_sessions
  WHERE visitor_hash = _visitor_hash AND last_heartbeat_at > now() - interval '1 day';
  IF daily_heartbeats >= 1000 THEN RETURN jsonb_build_object('result', 'rate_limited'); END IF;

  elapsed = extract(epoch FROM (now() - session.last_heartbeat_at));
  IF elapsed < 15 THEN RETURN jsonb_build_object('result', 'rate_limited'); END IF;
  increment = CASE WHEN elapsed > 75 THEN 0 ELSE GREATEST(0, LEAST(45, floor(elapsed)::int)) END;

  UPDATE public.engagement_sessions
  SET last_heartbeat_at = now(),
      active_seconds = active_seconds + increment,
      heartbeat_count = heartbeat_count + 1
  WHERE id = _session_id
  RETURNING active_seconds, heartbeat_count INTO session.active_seconds, session.heartbeat_count;
  INSERT INTO public.engagement_heartbeats (session_id, visitor_hash, generated_project_id, active_seconds)
  VALUES (_session_id, _visitor_hash, _generated_project_id, increment);
  RETURN jsonb_build_object(
    'result', 'ok', 'active_seconds', session.active_seconds,
    'heartbeat_count', session.heartbeat_count, 'increment', increment
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_engagement_heartbeat(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_engagement_heartbeat(uuid,text,uuid) TO service_role;

COMMENT ON TABLE public.engagement_heartbeats IS 'Accepted server-timestamped active-time increments; daily analytics use created_at in UTC.';