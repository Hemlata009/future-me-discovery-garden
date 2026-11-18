<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.

<!-- LOVABLE:END -->

## Project conventions

- Keep sample project pages reading the static catalog in src/lib/projects.ts; the growth dashboard reads only live database aggregates and never shows illustrative numbers.
- Recorded student activity (discovery journeys, saves, shares, invitations, interest notes, visits) lives in the connected Cloud database under `public`, always with row-level security; read-back is owner-scoped or admin-scoped, never public.
- Keep shared project data and demo rules in browser-safe library modules and reusable UI in components; routes compose these so sample experiences stay consistent.
- Carry discovery selections through validated project search parameters rather than browser storage so shared projects work without a backend.
- Define visual styles and colors in the central CSS design system; use the shared Button variants for interactive controls.
- AI project generation runs in a server route under src/routes/api/ that calls Anthropic's API directly through its official SDK, because prompts, keys and token counts must never reach the browser; generated projects are saved to the database and read back only by the site's own server-side lookup by project id, so a shared link works for anyone.
- The AI key and the database service key are server-side only: read them from process.env inside a handler, never from browser code, and name the model through server config instead of hardcoding it in app code.
- AI generation limits are claimed atomically through a database function keyed by a hashed, server-issued HttpOnly visitor cookie, with independent site-wide caps read from server env; failed generations release their slot so only successes count.
- Growth events go through /api/track into one database event log via a server-only function that applies first-touch attribution, dedupe keys, self-referral and spam guards; browsers may only send a fixed allow-list of events and fields, and nothing is written to other analytics pipelines.
- The admin dashboard lives under the managed _authenticated gate, and its report server function re-checks the admin role on every call before reading with the service client; admin roles are granted only by trusted SQL, never through the app.
- Visitor entry is tracked once per page load from the root route on any public page; the referral code rides on the entry and referral visits so first-touch attribution never loses it.
- /api/track returns 503 on write failure and 429 on rate limits; only recorded, duplicate or ignored events count as success, and it requires an existing visitor cookie.
- Answer filters on the growth report define a visitor cohort; metrics that can't be attributed to answers are returned as null rather than shown with mismatched denominators.
- Team accounts are invitation-only (sign-up disabled); retention purges run from a scheduled /api/public/cron route.
- Parent briefs and grounded Q&A use only the saved project and the browser-safe NIAT fact sheet; parent briefs are read by id through a server lookup, and counsellor contact details are never written to analytics.
- Consented counsellor requests reuse visitor first-touch attribution and the existing event log, retain the database row when webhook delivery fails, and are purged after 180 days by the existing retention function.
- Referral journey counts come from a separate service-only database function called by the admin report server code, so the main growth report stays unchanged.
- Vite explicitly defines the public Cloud URL and publishable key for published browser builds because managed publishing omitted them; never define server credentials or service keys there.
- The /counsellor CRM reuses consented counsellor_requests as identified leads; every server function checks admin/counsellor roles, assigned counsellors are RLS-scoped to their own leads, phone reveals are separate, and active-time analytics come only from server-timestamped heartbeats.
