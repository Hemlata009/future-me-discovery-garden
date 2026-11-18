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
