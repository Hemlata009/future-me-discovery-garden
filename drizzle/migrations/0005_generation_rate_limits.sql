CREATE TABLE public.generation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.generation_attempts TO service_role;
ALTER TABLE public.generation_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX generation_attempts_visitor_idx ON public.generation_attempts (visitor_hash, created_at DESC);
CREATE INDEX generation_attempts_created_idx ON public.generation_attempts (created_at DESC);

CREATE OR REPLACE FUNCTION public.claim_generation_slot(
  _visitor_hash text,
  _visitor_limit int,
  _visitor_window_seconds int,
  _global_per_minute int,
  _global_per_day int,
  _daily_token_limit bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_oldest timestamptz;
  g_minute int;
  g_day int;
  tokens bigint;
  new_id uuid;
BEGIN
  -- Serialise all claims so concurrent requests cannot slip past a limit.
  PERFORM pg_advisory_xact_lock(hashtext('claim_generation_slot'));

  SELECT count(*), min(created_at) INTO v_count, v_oldest
  FROM public.generation_attempts
  WHERE visitor_hash = _visitor_hash
    AND created_at > now() - make_interval(secs => _visitor_window_seconds);
  IF v_count >= _visitor_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'visitor',
      'retry_after_seconds', GREATEST(1, ceil(extract(epoch FROM (v_oldest + make_interval(secs => _visitor_window_seconds) - now())))::int));
  END IF;

  SELECT count(*) INTO g_minute FROM public.generation_attempts WHERE created_at > now() - interval '1 minute';
  IF g_minute >= _global_per_minute THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'global_minute', 'retry_after_seconds', 60);
  END IF;

  SELECT count(*) INTO g_day FROM public.generation_attempts WHERE created_at > now() - interval '1 day';
  IF g_day >= _global_per_day THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'global_day', 'retry_after_seconds', 3600);
  END IF;

  IF _daily_token_limit > 0 THEN
    SELECT COALESCE(sum(COALESCE(input_tokens,0) + COALESCE(output_tokens,0)), 0) INTO tokens
    FROM public.generated_projects WHERE created_at > now() - interval '1 day';
    IF tokens >= _daily_token_limit THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'global_tokens', 'retry_after_seconds', 3600);
    END IF;
  END IF;

  INSERT INTO public.generation_attempts (visitor_hash) VALUES (_visitor_hash) RETURNING id INTO new_id;
  RETURN jsonb_build_object('allowed', true, 'attempt_id', new_id);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_generation_slot(text,int,int,int,int,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_generation_slot(text,int,int,int,int,bigint) TO service_role;