# Growth reporting: units, test traffic and the referral fix

Audit of 2026-11-18 (live data 12–18 Nov 2026) for the admin growth dashboard (`/admin`)
and the counsellor CRM. No data was deleted or rewritten.

## Units and rates

Every figure on `/admin` states its unit: **unique visitors**, **unique projects**,
**unique briefs** or **events**. Every rate is shown as
`value% (numerator ÷ denominator unit)`, and a zero denominator shows `—`. Rates are not
chained across rows whose groups don't nest inside each other.

| Figure                                 | Unit                                                             | Rate                                              |
| -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| Visitors                               | unique visitors with any event                                   | —                                                 |
| Started discovery                      | unique visitors with `discovery_started`                         | ÷ unique visitors                                 |
| Completed discovery                    | unique visitors with `discovery_completed`                       | ÷ unique visitors                                 |
| Projects generated                     | unique `generated_project_id` on `generation_succeeded`          | —                                                 |
| Successful generation events           | events                                                           | —                                                 |
| Projects with a share action           | unique projects generated in the period with ≥1 `project_shared` | ÷ unique projects generated                       |
| Clicked the application link           | unique visitors with `cta_clicked` / `start_application`         | ÷ unique visitors                                 |
| Generation success rate                | events                                                           | successes ÷ generation events that reached the AI |
| NIAT website click-through (by source) | unique visitors                                                  | `visit_niat` visitors ÷ visitors                  |
| Qualification rate                     | unique visitors                                                  | qualified referrals ÷ unique referral visitors    |

The start-cohort completion rate (people who started in the period and completed by its
end) is unchanged and shown under the funnel. With answer filters (interest, technology,
language, academic status) the unique-visitor breakdown is not shown, as before.

### Family engagement

Parent Brief events are **not** sequential: a brief can be opened without a recorded
share, and activity in a period can relate to briefs generated earlier. The dashboard
shows:

- **Brief cohort**: briefs generated in the period, and how many of _those_ briefs were
  shared, opened or received ≥1 parent question. Each rate is ÷ briefs generated, so none
  can exceed 100%.
- **All engagement in the period**: separate counts with units (share events, unique
  briefs opened, questions, consented counsellor requests, undelivered requests,
  application-link clicks), with no conversion between them.

### NIAT links

| `cta`               | Meaning                                               |
| ------------------- | ----------------------------------------------------- |
| `start_application` | Clicked through to the official NIAT application page |
| `visit_niat`        | Clicked through to the official NIAT website          |
| `explore_niat`      | Opened the NIAT information pop-up on this site       |

Each is shown separately with events and unique visitors. None is a submitted or
completed application; those need NIAT admissions records.

## Test / QA traffic

UTM sources `qa`, `test`, `testing` and `internal` (case-insensitive) mark test traffic.
These rows appear in a separate **Test / QA traffic** table on `/admin`, are kept out of
**Campaign performance**, and are never highlighted as the Track B campaign in the CRM.
A notice states how many unique test visitors the totals include; choose a real Source in
the filter to exclude them from every number. First-touch attribution is unchanged and
nothing is deleted.

The `qa` / `futureme_family_warmlead_test` rows seen on 18 Nov 2026 (4 visitors, 1
generation) came from automated QA of the Track B landing page during development.

Not done (needs a database change through Lovable): an "exclude test traffic" option
inside `growth_report`, so totals can drop test visitors without picking one source.

## Referral journey mismatch

**Symptom:** Referral performance showed 1 referral visit and 1 unique visitor, while the
referred-visitor journey showed 0.

**Cause:** `record_growth_event` stores `growth_events.referral_code` from the visitor's
**first-touch** attribution. A visitor who first arrived directly and later opened a
referral link gets a `referral_visit` row with `referral_code = NULL`. `growth_report`
counts the event (1), but `referral_journey_report` joins on `referral_code` and finds
nothing (0). The CRM's per-lead "referral visits generated" had the same blind spot.

**App fix (live once published):** the admin report computes the referred journey on the
server from `referral_visit` events. It matches the link by the stored code or, when no
code was stored, by the project the link points to (`referral_visit` rows always carry
the link's `generated_project_id`). The link owner is never counted. The CRM uses the
same fallback. Covered by `src/test/growth-journey.test.ts` and
`src/test/counsellor-workspace.test.ts`.

**Permanent fix (NOT applied, needs Lovable):** store the exact link code on each
`referral_visit` without touching first-touch attribution. Paste into the Lovable chat:

> Please add a migration with exactly this SQL, then regenerate the Supabase types. Do not
> change any other table, function or data.

```sql
ALTER TABLE public.growth_events ADD COLUMN referral_link_code text;

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
    failure_kind, cta, dedupe_key, entry_page, referral_link_code
  ) VALUES (
    _event, _visitor_hash, _generated_project_id, _parent_brief_id, attr.referral_code, _channel,
    attr.utm_source, attr.utm_medium, attr.utm_campaign, _interest, _technology, _language, _class_status,
    _failure_kind, _cta, key, _entry_page,
    CASE WHEN _event = 'referral_visit' THEN valid_ref END
  ) ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN CASE WHEN inserted = 0 THEN 'duplicate' ELSE 'ok' END;
END;
$$;
REVOKE ALL ON FUNCTION public.record_growth_event(text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_growth_event(text,text,uuid,text,text,text,text,text,text,text,text,text,text,text,text,uuid) TO service_role;

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
  -- Exact link code when stored; otherwise the first-touch code; otherwise any link
  -- for the visited project (referral_visit rows always carry the link's project).
  SELECT ev.visitor_hash, min(ev.created_at) AS first_at
  FROM ev
  WHERE ev.event_name = 'referral_visit'
    AND EXISTS (
      SELECT 1 FROM public.referral_links rl
      WHERE rl.owner_visitor_hash <> ev.visitor_hash
        AND (rl.code = COALESCE(ev.referral_link_code, ev.referral_code)
             OR (ev.referral_link_code IS NULL AND rl.generated_project_id = ev.generated_project_id))
    )
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
```

`referral_code` keeps meaning first touch everywhere, so `growth_report`'s acquisition
and referral-credit figures are unchanged. Existing rows are not rewritten; the project
fallback keeps covering them. The app reads `referral_link_code` automatically once it
exists (`select("*")`).

Rollback: re-run the `record_growth_event` and `referral_journey_report` definitions from
migrations 0014 and 0012, then `ALTER TABLE public.growth_events DROP COLUMN referral_link_code;`.

### SQL regression check (run after applying, in the SQL editor)

It runs inside a transaction and rolls back, so it leaves no data behind.

```sql
BEGIN;
INSERT INTO public.generated_projects (id, interest, technology, project_type, class_status, language, generated_content, owner_visitor_hash)
VALUES ('00000000-0000-4000-8000-0000000000aa', 'farming', 'ai', 'assistant', 'class12', 'english', '{}'::jsonb, repeat('a', 64));
INSERT INTO public.referral_links (code, generated_project_id, owner_visitor_hash)
VALUES ('QAREFTEST001', '00000000-0000-4000-8000-0000000000aa', repeat('a', 64));
-- A friend lands directly first (first touch = direct), then opens the referral link.
SELECT public.record_growth_event('landing_visit', repeat('b', 64));
SELECT public.record_growth_event('referral_visit', repeat('b', 64), NULL, 'QAREFTEST001');
SELECT public.record_growth_event('discovery_started', repeat('b', 64));
-- Expect referral_code (first touch) = NULL and referral_link_code = QAREFTEST001.
SELECT referral_code, referral_link_code FROM public.growth_events
WHERE visitor_hash = repeat('b', 64) AND event_name = 'referral_visit';
-- Expect referred_visitors >= 1 and started_discovery >= 1.
SELECT public.referral_journey_report(current_date, current_date);
ROLLBACK;
```
