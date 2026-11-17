# FutureMe AI — Explore before you apply

AI-powered student discovery, personalized projects, and grounded guidance for families.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/571f93c1-abef-4042-b48a-499f9160e283).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Server-side configuration

AI project generation talks to Anthropic directly. The values below are read on
the server only — none of them is ever sent to the browser. Set them in Project
Settings → Secrets (`.env.example` lists the same names with placeholders).

| Name                        | Needed for                                    | Notes                                                                                       |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`         | Generating a student's project                | Anthropic API key. Without it the wizard reports that AI generation isn't switched on.      |
| `ANTHROPIC_MODEL`           | Choosing the model                            | Optional. Defaults to `claude-sonnet-5-5`.                                                  |
| `SUPABASE_URL`              | Saving and reading projects                   | Provided by Lovable Cloud.                                                                  |
| `SUPABASE_SERVICE_ROLE_KEY` | Saving a project, and opening a shared link   | Server-only. It is the only path that can read a saved project.                             |
| `SUPABASE_PUBLISHABLE_KEY`  | Public, read-only lookups from server code    | Server-only here; the browser gets the `VITE_` copy.                                        |
| `COUNSELLOR_WEBHOOK_URL`    | Delivering consented counsellor-call requests | Optional server-only webhook. The request stays saved when this is unset or delivery fails. |

Saved student projects are not readable straight from the database: anonymous
visitors and signed-in users have no access, and the shared-link page fetches
exactly one project by its id on the server.

## Explore before you apply

Generated projects include a Parent Brief action. The brief and its grounded
Q&A use only the saved project and the seven-fact NIAT sheet in
`src/lib/niat-facts.ts`; no outside claims or outcome promises are allowed.
Each visitor can ask three successful questions per brief. Parent briefs are
private database rows fetched one id at a time by the site's server.

A counsellor-call request requires explicit consent and a valid 10-digit Indian
mobile number. Contact details are never written to the growth event log. The
request keeps the visitor's existing first-touch referral and campaign tags,
then is delivered to `COUNSELLOR_WEBHOOK_URL` when configured. A missing or
failed webhook is recorded safely without discarding the saved request.
Signed-in admins can read requests only through the existing admin role.

Environment files are not committed — `.env` and `.env.*` are ignored, with
`.env.example` kept as the documented template.

## Admin access (one-time setup)

There is no way to become an admin through the website. To grant access:

1. Add the person as a user from the backend's Users section (public sign-up is disabled; there is no "Create account" option).
2. A trusted operator runs this once in the backend SQL editor, replacing the placeholder:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role from auth.users
where email = 'ADMIN_EMAIL_HERE'
on conflict (user_id, role) do nothing;
```

To remove access: `delete from public.user_roles where role = 'admin' and user_id = (select id from auth.users where email = 'ADMIN_EMAIL_HERE');`

## Growth dashboard formulas

All numbers are live database aggregates over UTC dates; a rate with a zero denominator shows "—".

- **Unique visitors** — distinct anonymous visitors with any event. The entry visit is recorded on whichever public page a visitor lands on (home, discover, project, projects, how-it-works, showcase), once per page load and at most once per visitor per day.
- **Discovery completion rate** — completions ÷ starts (overall view only).
- **Generation success rate** — successes ÷ (successes + failures after reaching the AI: `anthropic:*`, `invalid_response`, `save`). Requests turned away before any AI call (`config`, `visitor_limit`, `global_limit`, `limit_check`) are reported separately.
- **Share actions** — link copied or WhatsApp opened (not proof a link was received). **Projects with at least one share action** ÷ successful generations.
- **Referral visits** — first visit per visitor per referral link, excluding the link owner. Referral starts / generations / NIAT outbound clicks are credited by first touch.
- **NIAT pop-up opens** (`explore_niat`) and **NIAT outbound clicks** (`visit_niat`) are separate. The acquisition funnel uses outbound clicks only. Neither is an inquiry or admission.
- **Filters** — source, medium and campaign each filter on first-touch attribution. Interest, technology, language and academic-status switch to a cohort: visitors who completed a matching discovery, counting only their matching completions, generations and projects. Discovery starts carry no answers, so starts and completion rate are not shown for a cohort.

## Production configuration

- `VISITOR_HASH_SALT` (required, 32+ random characters, server secret). Without it, visitor-tracking and generation requests fail outside localhost. Changing it resets all visitor identities.
- Team accounts are invitation-only: public sign-up is disabled. Add the person as a user from the backend's Users section, then grant admin with the SQL above. New accounts never get a role automatically.
- Retention: `purge_expired_growth_data()` runs daily at 03:30 UTC via `/api/public/cron/purge-growth-data` (cron secret required). It deletes generation-limit records older than 30 days, growth events older than 395 days (~13 months), and counsellor requests older than 180 days. Minimums are enforced (2, 90 and 30 days respectively).
- Tracking abuse protection: same-origin check, JSON only, 2 KB body cap, a visitor cookie must already exist (issued by `/api/visitor`), fixed event/field allow-list, 200 events per visitor per 10 minutes, server-side dedupe. Write failures return 503, rate limits 429.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
