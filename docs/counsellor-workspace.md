# Counsellor lead intelligence workspace

## Access and one-time counsellor provisioning

Public account creation stays disabled. Never add a role through the browser or trust user-editable metadata.

1. A trusted operator adds the counsellor as a user in the backend Users section.
2. The operator runs this once, replacing the placeholder with the invited person's email:

```sql
insert into public.user_roles (user_id, role)
select id, 'counsellor'::public.app_role from auth.users
where email = 'COUNSELLOR_EMAIL_HERE'
on conflict (user_id, role) do nothing;
```

3. The counsellor signs in at `/auth?redirect=/counsellor`. They initially see no leads until an admin assigns one in `/counsellor`.
4. Admins retain full access and can open `/counsellor`, assign or reassign leads, and use the existing `/admin` growth dashboard.

To remove counsellor access:

```sql
delete from public.user_roles
where role = 'counsellor'
  and user_id = (select id from auth.users where email = 'COUNSELLOR_EMAIL_HERE');
```

No application flow creates accounts or assigns roles automatically.

## Security boundaries

- Existing `counsellor_requests` rows are the only identified leads. Anonymous visitors are never leads.
- New requests store the server-issued visitor hash alongside the already-consented contact request. Existing rows were backfilled only from their generated project's owner hash.
- Admins can read and manage every lead. Counsellors can read and update only rows where `assigned_to` is their authenticated user ID.
- Direct table writes are limited to operational columns. Contact details, consent, attribution and historical request fields cannot be edited through the counsellor workspace.
- Workspace responses contain masked mobile numbers. A separate authorised server request reveals one number only after the same role and assignment checks.
- Private projects, events, referral links and heartbeats are read with the privileged server client only after authorisation and only for permitted leads. These tables remain inaccessible to anonymous and ordinary authenticated clients.
- Contact names, phone numbers and notes are never copied into `growth_events` or engagement tables.
- Notes are for concise operational follow-up only, not sensitive personal information. No outbound call, message or email is sent automatically; `last_contacted_at` is set only when a counsellor records an outcome.

## Exact metric definitions

All report date filters use inclusive UTC calendar dates. The lead cohort is requests created within that range. Activity charts and lead engagement metrics use activity within the same range.

- **Identified leads** — consented counsellor requests in the selected range and visible to the signed-in role.
- **New leads** — visible cohort leads whose current status is `new`.
- **Active engagement duration** — sum of accepted server-timestamped heartbeat increments. The browser sends no duration. Increments are at most 45 seconds, require heartbeats 15–75 seconds apart, and stop after 75 seconds of server inactivity. Sessions expire after four hours or 480 heartbeats; visitor session and heartbeat caps also apply. The client sends only while the tab is visible and interaction occurred in the last 60 seconds.
- **Meaningful actions** — stored project views, demo interactions, project shares, Parent Brief generation/sharing/opening, parent questions, successful consented counsellor requests, and NIAT or application-link events. Existing server dedupe remains in force, so these are not raw physical clicks. Referral visits generated are reported separately rather than attributed as the lead owner's own engagement.
- **High engagement** — activity within seven days of the range end, at least four meaningful actions, and at least two distinct decision steps: demo, Parent Brief, parent question, counsellor request or application-link click.
- **Medium engagement** — recent activity with at least two meaningful actions or one decision step, without meeting High.
- **Low engagement** — limited activity or no activity within seven days of the range end.
- Engagement tiers explain observable behaviour only. They do not predict admission probability, student quality or application submission.
- **Follow-ups due** — active leads with a follow-up later today (UTC), excluding overdue items. **Overdue** means the timestamp is at or before the current time. Closed and not-interested leads are excluded from both.
- **Family engagement signals** — actual Parent Brief generated/shared/opened and parent-question events related to the lead visitor or project. A share is not proof of delivery. An anonymous brief opening is not proof the opener was a parent. `Parent/guardian identified` comes only from a consented request where `who = parent`.
- **Referral visits generated** — deduplicated `referral_visit` events using referral links owned by the lead's visitor hash.
- **Application-link clicks** — stored `start_application` events. They do not prove an application or admission.
- **Undelivered counsellor requests** — saved requests whose optional webhook has not been marked delivered; the lead remains available for authorised follow-up.
- **Daily active time and meaningful actions** — heartbeat and event timestamps grouped by their actual UTC day. No whole-session duration is reassigned to another day.

## Retention implications

The existing daily retention job keeps its 180-day counsellor-request purge and 395-day growth-event purge. Engagement sessions and their heartbeat rows are also purged after 395 days without a heartbeat. Deleting a generated project cascades to its engagement rows under the existing data lifecycle. Operational status, assignment, notes and follow-up fields are deleted with the parent counsellor request at its existing retention deadline. The optional webhook behavior is unchanged.

## CRM sections (added 2026-11-18)

`/counsellor` is organised into Overview, Lead pipeline, All leads, Follow-ups, Campaign performance and (admins only) Team performance. Every section is computed in the browser from the same authorised workspace response, so a counsellor only ever sees their assigned leads. Reporting presets are Today, 7 days, 30 days, This month and Custom, all in UTC calendar days.

### Priority labels (rule-based, `src/lib/counsellor-crm.ts`)

Only active leads (`new`, `assigned`, `contacted`, `follow_up`, `qualified`) get a follow-up priority. Each label shows its reasons.

- **Follow up now** — new and unassigned; follow-up overdue; or no recorded contact yet and any of: high engagement, a parent question, an application-link click.
- **Follow up today** — follow-up due later today (UTC), or a consented request not yet contacted. A low-engagement lead is never hidden.
- **Follow up later** — follow-up due tomorrow or later, or contacted with no next follow-up scheduled.
- **No immediate action** — closed or not interested.

Opening a lead never marks it contacted. `last_contacted_at` changes only when a new call outcome is recorded.

### Follow-up queue

Active leads are grouped as Overdue, Due today, Due tomorrow, Upcoming and No follow-up scheduled (UTC days). Quick filters: My follow-ups, All (admins), Overdue, Due today, Unassigned (admins), New not contacted, Undelivered requests.

### Funnel and campaign performance (admins)

The funnel reuses the existing admin growth report for the same dates. Anonymous stages are aggregate counts only. "Interactive demo used" has no aggregate total and "Completed NIAT application" needs NIAT admissions data, so both are shown as unavailable. Stages use different units, so a step can exceed 100% of the previous one.

Campaign rows join site-wide traffic (visitors, generated projects) from the growth report to consented-lead outcomes by UTM source, medium and campaign. `futureme_family_warmlead_test` is pinned and highlighted. Counsellors see lead columns for their own leads only. **Lead → app click** = leads with at least one application-link click ÷ leads in that row.

### Team performance (admins)

Per assignee and an Unassigned row: assigned, still new, contacted (outcome recorded), qualified, pending follow-ups, overdue, application-click leads. It is not a ranking. Average time to first contact and follow-up completion rate are **not** shown: only the latest contact time is stored, so they can't be computed reliably without an activity-history table.

### CSV export

All leads → Export CSV downloads the currently filtered, already-authorised leads with masked phone numbers only. Internal notes and visitor hashes are never exported, and cells are protected against spreadsheet formula injection.

## Remaining database requirements (NOT implemented)

None of the items below exist in the database or the app yet. Schema changes must be made through Lovable (paste the request into the Lovable chat); never add files under `drizzle/` by hand. Each change is additive and can be rolled back with the `DROP` shown.

### 1. Regenerate Supabase types

`src/integrations/supabase/types.ts` is generated by Lovable and does not yet list `pre_application_profiles` (the table itself exists and was verified live on 2026-11-18). `src/lib/application-profile.server.ts` reaches it through an untyped client until then. Ask Lovable: _"Regenerate the Supabase types from the current schema. Do not change any table."_ Afterwards the untyped cast can be replaced by the generated type.

### 2. Lead activity history (audit log)

Today `counsellor_requests` keeps only the latest status, assignment, outcome, notes and follow-up; earlier values are overwritten. A history table would record who changed what and when, and would make "time to first contact" and "follow-up completion rate" computable.

Suggested request to Lovable:

```sql
CREATE TABLE public.counsellor_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.counsellor_requests(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  field text NOT NULL CHECK (field IN ('status','assigned_to','next_follow_up_at','call_outcome','internal_notes')),
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX counsellor_request_events_request_idx ON public.counsellor_request_events (request_id, created_at);
REVOKE ALL ON public.counsellor_request_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.counsellor_request_events TO service_role;
ALTER TABLE public.counsellor_request_events ENABLE ROW LEVEL SECURITY;
-- Rollback: DROP TABLE public.counsellor_request_events;
```

Rows would be written by an `AFTER UPDATE` trigger on `counsellor_requests` whose function is `SECURITY DEFINER` with `SET search_path = public` (needed because signed-in users have no direct access to the history table), using `auth.uid()` as the actor, so the browser can never forge history. For notes, store only "changed" rather than the text if notes must not be duplicated. Rows are deleted with their request by the existing 180-day retention (cascade).

### 3. Optional callback fields

Only add these if counsellors will actually use them:

```sql
ALTER TABLE public.counsellor_requests
  ADD COLUMN preferred_callback_time text
    CHECK (preferred_callback_time IS NULL OR preferred_callback_time IN ('morning','afternoon','evening')),
  ADD COLUMN callback_question text
    CHECK (callback_question IS NULL OR char_length(callback_question) <= 300);
-- Rollback: ALTER TABLE public.counsellor_requests DROP COLUMN preferred_callback_time, DROP COLUMN callback_question;
```

The column-level `GRANT UPDATE` for counsellors must **not** include these fields (they are the requester's words). The request form, server schema (`counsellorRequestSchema`) and lead detail would then need updating, and the question text must never be copied into `growth_events` or webhook logs beyond the existing consented payload.
