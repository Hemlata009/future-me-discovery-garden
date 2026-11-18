ALTER TABLE public.counsellor_requests
  ADD COLUMN visitor_hash text,
  ADD COLUMN status text NOT NULL DEFAULT 'new',
  ADD COLUMN assigned_to uuid,
  ADD COLUMN next_follow_up_at timestamptz,
  ADD COLUMN last_contacted_at timestamptz,
  ADD COLUMN call_outcome text,
  ADD COLUMN internal_notes text NOT NULL DEFAULT '',
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.counsellor_requests cr
SET visitor_hash = gp.owner_visitor_hash
FROM public.generated_projects gp
WHERE gp.id = cr.generated_project_id AND cr.visitor_hash IS NULL;

ALTER TABLE public.counsellor_requests
  ADD CONSTRAINT counsellor_requests_status_check CHECK (status IN ('new','assigned','contacted','follow_up','qualified','not_interested','closed')),
  ADD CONSTRAINT counsellor_requests_call_outcome_check CHECK (call_outcome IS NULL OR call_outcome IN ('reached','no_answer','busy','wrong_number','callback_requested','not_interested')),
  ADD CONSTRAINT counsellor_requests_notes_length_check CHECK (char_length(internal_notes) <= 2000),
  ADD CONSTRAINT counsellor_requests_visitor_hash_check CHECK (visitor_hash IS NULL OR visitor_hash ~ '^[0-9a-f]{64}$');

CREATE INDEX counsellor_requests_assigned_idx ON public.counsellor_requests (assigned_to, status, created_at DESC);
CREATE INDEX counsellor_requests_follow_up_idx ON public.counsellor_requests (next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;
CREATE INDEX counsellor_requests_visitor_idx ON public.counsellor_requests (visitor_hash, created_at DESC);

CREATE FUNCTION public.touch_counsellor_request_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER counsellor_requests_touch_updated_at
BEFORE UPDATE ON public.counsellor_requests
FOR EACH ROW EXECUTE FUNCTION public.touch_counsellor_request_updated_at();

GRANT SELECT ON public.counsellor_requests TO authenticated;
GRANT UPDATE (status, assigned_to, next_follow_up_at, last_contacted_at, call_outcome, internal_notes, updated_at)
  ON public.counsellor_requests TO authenticated;
CREATE POLICY "Admins can manage lead workflow" ON public.counsellor_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Counsellors can read assigned leads" ON public.counsellor_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'counsellor') AND assigned_to = auth.uid());
CREATE POLICY "Counsellors can update assigned leads" ON public.counsellor_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'counsellor') AND assigned_to = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'counsellor') AND assigned_to = auth.uid());

CREATE TABLE public.engagement_sessions (
  id uuid PRIMARY KEY,
  visitor_hash text NOT NULL CHECK (visitor_hash ~ '^[0-9a-f]{64}$'),
  generated_project_id uuid REFERENCES public.generated_projects(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  active_seconds integer NOT NULL DEFAULT 0 CHECK (active_seconds BETWEEN 0 AND 14400),
  heartbeat_count integer NOT NULL DEFAULT 1 CHECK (heartbeat_count BETWEEN 1 AND 480)
);
REVOKE ALL ON public.engagement_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.engagement_sessions TO service_role;
ALTER TABLE public.engagement_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX engagement_sessions_visitor_idx ON public.engagement_sessions (visitor_hash, last_heartbeat_at DESC);
CREATE INDEX engagement_sessions_retention_idx ON public.engagement_sessions (last_heartbeat_at);

CREATE FUNCTION public.record_engagement_heartbeat(
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
  RETURN jsonb_build_object(
    'result', 'ok', 'active_seconds', session.active_seconds,
    'heartbeat_count', session.heartbeat_count, 'increment', increment
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_engagement_heartbeat(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_engagement_heartbeat(uuid,text,uuid) TO service_role;

ALTER TABLE public.growth_events DROP CONSTRAINT growth_events_event_name_check;
ALTER TABLE public.growth_events ADD CONSTRAINT growth_events_event_name_check CHECK (event_name IN (
  'landing_visit','discovery_started','discovery_completed','generation_succeeded','generation_failed',
  'project_viewed','project_shared','demo_interacted','referral_visit','cta_clicked','parent_brief_generated',
  'parent_brief_failed','parent_brief_shared','parent_brief_opened','parent_question_asked','counsellor_requested'
));

CREATE OR REPLACE FUNCTION public.record_growth_event(
  _event text, _visitor_hash text,
  _generated_project_id uuid DEFAULT NULL, _referral_code text DEFAULT NULL, _channel text DEFAULT NULL,
  _utm_source text DEFAULT NULL, _utm_medium text DEFAULT NULL, _utm_campaign text DEFAULT NULL,
  _interest text DEFAULT NULL, _technology text DEFAULT NULL, _language text DEFAULT NULL,
  _class_status text DEFAULT NULL, _failure_kind text DEFAULT NULL, _cta text DEFAULT NULL,
  _entry_page text DEFAULT NULL, _parent_brief_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
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
    WHEN 'demo_interacted' THEN _event || ':' || _visitor_hash || ':' || COALESCE(_generated_project_id::text, '') || ':' || today
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

CREATE OR REPLACE FUNCTION public.purge_expired_growth_data(_attempt_days int DEFAULT 30, _event_days int DEFAULT 395, _counsellor_days int DEFAULT 180)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE a int; e int; c int; ca int; es int;
BEGIN
  IF _attempt_days < 2 OR _event_days < 90 OR _counsellor_days < 30 THEN RAISE EXCEPTION 'retention period too short'; END IF;
  DELETE FROM public.generation_attempts WHERE created_at < now() - make_interval(days => _attempt_days);
  GET DIAGNOSTICS a = ROW_COUNT;
  DELETE FROM public.counsellor_request_attempts WHERE created_at < now() - make_interval(days => _attempt_days);
  GET DIAGNOSTICS ca = ROW_COUNT;
  DELETE FROM public.engagement_sessions WHERE last_heartbeat_at < now() - make_interval(days => _event_days);
  GET DIAGNOSTICS es = ROW_COUNT;
  DELETE FROM public.growth_events WHERE created_at < now() - make_interval(days => _event_days);
  GET DIAGNOSTICS e = ROW_COUNT;
  DELETE FROM public.counsellor_requests WHERE created_at < now() - make_interval(days => _counsellor_days);
  GET DIAGNOSTICS c = ROW_COUNT;
  RETURN jsonb_build_object(
    'attempts_deleted', a, 'events_deleted', e,
    'counsellor_requests_deleted', c, 'counsellor_attempts_deleted', ca,
    'engagement_sessions_deleted', es
  );
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_growth_data(int,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_growth_data(int,int,int) TO service_role;

COMMENT ON COLUMN public.counsellor_requests.assigned_to IS 'Logical auth user id; access is enforced by user_roles and RLS.';
COMMENT ON TABLE public.engagement_sessions IS 'Server-calculated visible, recently-interacted engagement time. No form contents, keystrokes or pointer coordinates.';