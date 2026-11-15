REVOKE ALL ON public.growth_events, public.visitor_attribution, public.referral_links, public.generation_attempts FROM anon, authenticated;
GRANT SELECT ON public.growth_events, public.visitor_attribution, public.referral_links TO authenticated;
GRANT ALL ON public.growth_events, public.visitor_attribution, public.referral_links, public.generation_attempts TO service_role;